import { Request, Response } from "express";
import { Prisma, EstadoComprobante, Naturaleza } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

interface Linea {
  comprobanteId: number;
  ref: string;
  fecha: Date;
  concepto: string;
  codigoCuenta: string;
  nombreCuenta: string;
  tercero: string | null;
  debito: number;
  credito: number;
}

function whereFiltros(req: Request): Prisma.ComprobanteWhereInput {
  const where: Prisma.ComprobanteWhereInput = { estado: EstadoComprobante.CONTABILIZADO };
  const periodoId = req.query.periodoId ? Number(req.query.periodoId) : undefined;
  const fechaDesde = req.query.fechaDesde ? String(req.query.fechaDesde) : undefined;
  const fechaHasta = req.query.fechaHasta ? String(req.query.fechaHasta) : undefined;
  if (periodoId) where.periodoId = periodoId;
  if (fechaDesde || fechaHasta) {
    where.fecha = {};
    if (fechaDesde) where.fecha.gte = new Date(fechaDesde);
    if (fechaHasta) where.fecha.lte = new Date(fechaHasta);
  }
  return where;
}

const ref = (tipo: string, consecutivo: number) => `${tipo[0]}-${String(consecutivo).padStart(4, "0")}`;

export async function libroDiario(req: Request, res: Response): Promise<void> {
  const comprobantes = await prisma.comprobante.findMany({
    where: whereFiltros(req),
    orderBy: [{ fecha: "asc" }, { consecutivo: "asc" }],
    include: {
      asientos: {
        include: { cuenta: { select: { codigo: true, nombre: true } }, tercero: { select: { nombreRazonSocial: true } } },
      },
    },
  });

  const lineas: Linea[] = [];
  for (const c of comprobantes) {
    for (const a of c.asientos) {
      lineas.push({
        comprobanteId: c.id,
        ref: ref(c.tipo, c.consecutivo),
        fecha: c.fecha,
        concepto: c.concepto,
        codigoCuenta: a.cuenta.codigo,
        nombreCuenta: a.cuenta.nombre,
        tercero: a.tercero?.nombreRazonSocial ?? null,
        debito: a.debito.toNumber(),
        credito: a.credito.toNumber(),
      });
    }
  }

  const totalDebitos = lineas.reduce((s, l) => s + l.debito, 0);
  const totalCreditos = lineas.reduce((s, l) => s + l.credito, 0);

  res.json({
    totalDebitos,
    totalCreditos,
    numComprobantes: comprobantes.length,
    numLineas: lineas.length,
    lineas: lineas.map((l) => ({ ...l, fecha: l.fecha.toISOString().slice(0, 10) })),
  });
}

export async function libroMayor(req: Request, res: Response): Promise<void> {
  const cuentaId = req.query.cuentaId ? Number(req.query.cuentaId) : undefined;

  const comprobantes = await prisma.comprobante.findMany({
    where: whereFiltros(req),
    select: {
      asientos: {
        where: cuentaId ? { cuentaId } : undefined,
        include: { cuenta: { select: { id: true, codigo: true, nombre: true, naturaleza: true } } },
      },
    },
  });

  const porCuenta = new Map<number, { codigo: string; nombre: string; naturaleza: Naturaleza; debitos: number; creditos: number }>();
  for (const c of comprobantes) {
    for (const a of c.asientos) {
      const act = porCuenta.get(a.cuenta.id) ?? {
        codigo: a.cuenta.codigo,
        nombre: a.cuenta.nombre,
        naturaleza: a.cuenta.naturaleza,
        debitos: 0,
        creditos: 0,
      };
      act.debitos += a.debito.toNumber();
      act.creditos += a.credito.toNumber();
      porCuenta.set(a.cuenta.id, act);
    }
  }

  const cuentas = [...porCuenta.values()]
    .map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      naturaleza: c.naturaleza,
      debitos: c.debitos,
      creditos: c.creditos,
      saldo: c.naturaleza === "DEUDORA" ? c.debitos - c.creditos : c.creditos - c.debitos,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  res.json({
    totalDebitos: cuentas.reduce((s, c) => s + c.debitos, 0),
    totalCreditos: cuentas.reduce((s, c) => s + c.creditos, 0),
    cuentas,
  });
}

export async function balanceComprobacion(req: Request, res: Response): Promise<void> {
  const comprobantes = await prisma.comprobante.findMany({
    where: whereFiltros(req),
    select: {
      asientos: {
        include: { cuenta: { select: { codigo: true, nombre: true, clase: true, naturaleza: true } } },
      },
    },
  });

  const porCuenta = new Map<string, { codigo: string; nombre: string; clase: number; naturaleza: Naturaleza; debitos: number; creditos: number }>();
  for (const c of comprobantes) {
    for (const a of c.asientos) {
      const key = a.cuenta.codigo;
      const act = porCuenta.get(key) ?? {
        codigo: a.cuenta.codigo,
        nombre: a.cuenta.nombre,
        clase: a.cuenta.clase,
        naturaleza: a.cuenta.naturaleza,
        debitos: 0,
        creditos: 0,
      };
      act.debitos += a.debito.toNumber();
      act.creditos += a.credito.toNumber();
      porCuenta.set(key, act);
    }
  }

  let totalDebitos = 0;
  let totalCreditos = 0;
  let saldosDeudores = 0;
  let saldosAcreedores = 0;

  const cuentas = [...porCuenta.values()]
    .map((c) => {
      const saldo = c.debitos - c.creditos;
      const saldoDeudor = saldo > 0 ? saldo : 0;
      const saldoAcreedor = saldo < 0 ? -saldo : 0;
      totalDebitos += c.debitos;
      totalCreditos += c.creditos;
      saldosDeudores += saldoDeudor;
      saldosAcreedores += saldoAcreedor;
      return {
        codigo: c.codigo,
        nombre: c.nombre,
        clase: c.clase,
        naturaleza: c.naturaleza,
        debitos: c.debitos,
        creditos: c.creditos,
        saldoDeudor,
        saldoAcreedor,
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  res.json({ totalDebitos, totalCreditos, saldosDeudores, saldosAcreedores, cuentas });
}
