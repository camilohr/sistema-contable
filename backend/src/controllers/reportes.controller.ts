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

export function whereFiltros(req: Request): Prisma.ComprobanteWhereInput {
  const where: Prisma.ComprobanteWhereInput = { estado: EstadoComprobante.CONTABILIZADO, empresaId: req.empresaId };
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

export interface SaldoCuenta {
  codigo: string;
  nombre: string;
  clase: number;
  grupo: string;
  naturaleza: Naturaleza;
  debitos: number;
  creditos: number;
  saldo: number;
}

export async function saldosPorCuenta(where: Prisma.ComprobanteWhereInput): Promise<SaldoCuenta[]> {
  const comprobantes = await prisma.comprobante.findMany({
    where,
    select: {
      asientos: {
        include: { cuenta: { select: { codigo: true, nombre: true, clase: true, naturaleza: true } } },
      },
    },
  });

  const porCuenta = new Map<string, SaldoCuenta>();
  for (const c of comprobantes) {
    for (const a of c.asientos) {
      const codigo = a.cuenta.codigo;
      const act = porCuenta.get(codigo) ?? {
        codigo,
        nombre: a.cuenta.nombre,
        clase: a.cuenta.clase,
        grupo: codigo.slice(0, 2),
        naturaleza: a.cuenta.naturaleza,
        debitos: 0,
        creditos: 0,
        saldo: 0,
      };
      act.debitos += a.debito.toNumber();
      act.creditos += a.credito.toNumber();
      porCuenta.set(codigo, act);
    }
  }

  for (const c of porCuenta.values()) {
    c.saldo = c.naturaleza === "DEUDORA" ? c.debitos - c.creditos : c.creditos - c.debitos;
  }
  return [...porCuenta.values()].filter((c) => c.saldo !== 0).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
}

function agruparPorClase(saldos: SaldoCuenta[], clases: number[]): SaldoCuenta[] {
  return saldos.filter((c) => clases.includes(c.clase));
}

function construirSeccion(saldos: SaldoCuenta[], nombreGrupos: Map<string, string>) {
  const grupos = new Map<string, { grupo: string; nombre: string; cuentas: { codigo: string; nombre: string; saldo: number }[]; total: number }>();
  for (const c of saldos) {
    const act = grupos.get(c.grupo) ?? { grupo: c.grupo, nombre: nombreGrupos.get(c.grupo) ?? `Grupo ${c.grupo}`, cuentas: [], total: 0 };
    act.cuentas.push({ codigo: c.codigo, nombre: c.nombre, saldo: c.saldo });
    act.total += c.saldo;
    grupos.set(c.grupo, act);
  }
  return [...grupos.values()].sort((a, b) => a.grupo.localeCompare(b.grupo, undefined, { numeric: true }));
}

export interface DatosLibroDiario {
  lineas: Linea[];
  totalDebitos: number;
  totalCreditos: number;
  numComprobantes: number;
  numLineas: number;
}

export async function datosLibroDiario(where: Prisma.ComprobanteWhereInput): Promise<DatosLibroDiario> {
  const comprobantes = await prisma.comprobante.findMany({
    where,
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

  return { lineas, totalDebitos, totalCreditos, numComprobantes: comprobantes.length, numLineas: lineas.length };
}

export async function libroDiario(req: Request, res: Response): Promise<void> {
  const datos = await datosLibroDiario(whereFiltros(req));
  res.json({
    totalDebitos: datos.totalDebitos,
    totalCreditos: datos.totalCreditos,
    numComprobantes: datos.numComprobantes,
    numLineas: datos.numLineas,
    lineas: datos.lineas.map((l) => ({ ...l, fecha: l.fecha.toISOString().slice(0, 10) })),
  });
}

export interface CuentaMayor {
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  debitos: number;
  creditos: number;
  saldo: number;
}

export interface DatosLibroMayor {
  cuentas: CuentaMayor[];
  totalDebitos: number;
  totalCreditos: number;
}

export async function datosLibroMayor(where: Prisma.ComprobanteWhereInput, cuentaId?: number): Promise<DatosLibroMayor> {
  const comprobantes = await prisma.comprobante.findMany({
    where,
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

  const cuentas: CuentaMayor[] = [...porCuenta.values()]
    .map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      naturaleza: c.naturaleza,
      debitos: c.debitos,
      creditos: c.creditos,
      saldo: c.naturaleza === "DEUDORA" ? c.debitos - c.creditos : c.creditos - c.debitos,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  return {
    totalDebitos: cuentas.reduce((s, c) => s + c.debitos, 0),
    totalCreditos: cuentas.reduce((s, c) => s + c.creditos, 0),
    cuentas,
  };
}

export async function libroMayor(req: Request, res: Response): Promise<void> {
  const cuentaId = req.query.cuentaId ? Number(req.query.cuentaId) : undefined;
  const datos = await datosLibroMayor(whereFiltros(req), cuentaId);
  res.json(datos);
}

export interface DatosBalanceComprobacion {
  totalDebitos: number;
  totalCreditos: number;
  saldosDeudores: number;
  saldosAcreedores: number;
  cuentas: {
    codigo: string;
    nombre: string;
    clase: number;
    naturaleza: Naturaleza;
    debitos: number;
    creditos: number;
    saldoDeudor: number;
    saldoAcreedor: number;
  }[];
}

export async function datosBalanceComprobacion(where: Prisma.ComprobanteWhereInput): Promise<DatosBalanceComprobacion> {
  const comprobantes = await prisma.comprobante.findMany({
    where,
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

  return { totalDebitos, totalCreditos, saldosDeudores, saldosAcreedores, cuentas };
}

export async function balanceComprobacion(req: Request, res: Response): Promise<void> {
  const datos = await datosBalanceComprobacion(whereFiltros(req));
  res.json(datos);
}

async function nombreGrupos(empresaId: string): Promise<Map<string, string>> {
  const grupos = await prisma.cuenta.findMany({
    where: { codigo: { not: { contains: "." } }, OR: [{ empresaId: null }, { empresaId }] },
    select: { codigo: true, nombre: true },
  });
  const mapa = new Map<string, string>();
  for (const g of grupos) {
    if (g.codigo.length === 2) mapa.set(g.codigo, g.nombre);
  }
  return mapa;
}

export interface CuentaBalance {
  codigo: string;
  nombre: string;
  saldo: number;
}

export interface GrupoBalance {
  grupo: string;
  nombre: string;
  cuentas: CuentaBalance[];
  total: number;
}

export interface DatosBalanceGeneral {
  activo: GrupoBalance[];
  pasivo: GrupoBalance[];
  patrimonio: GrupoBalance[];
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
  resultado: number;
  ecuacionOK: boolean;
}

export async function datosBalanceGeneral(where: Prisma.ComprobanteWhereInput, empresaId: string): Promise<DatosBalanceGeneral> {
  const saldos = await saldosPorCuenta(where);
  const nombres = await nombreGrupos(empresaId);

  const activo = construirSeccion(agruparPorClase(saldos, [1]), nombres);
  const pasivo = construirSeccion(agruparPorClase(saldos, [2]), nombres);
  const patrimonio = construirSeccion(agruparPorClase(saldos, [3]), nombres);

  const resultado =
    saldos.reduce((s, c) => s + (c.clase === 4 ? c.saldo : 0), 0) -
    saldos.reduce((s, c) => s + (c.clase === 5 || c.clase === 6 ? c.saldo : 0), 0);

  if (resultado !== 0) {
    patrimonio.push({ grupo: "99", nombre: "Resultados del ejercicio", cuentas: [], total: resultado });
    patrimonio.sort((a, b) => a.grupo.localeCompare(b.grupo, undefined, { numeric: true }));
  }

  const totalActivo = activo.reduce((s, g) => s + g.total, 0);
  const totalPasivo = pasivo.reduce((s, g) => s + g.total, 0);
  const totalPatrimonio = patrimonio.reduce((s, g) => s + g.total, 0);

  return {
    activo,
    pasivo,
    patrimonio,
    totalActivo,
    totalPasivo,
    totalPatrimonio,
    resultado,
    ecuacionOK: totalActivo === totalPasivo + totalPatrimonio,
  };
}

export async function balanceGeneral(req: Request, res: Response): Promise<void> {
  const datos = await datosBalanceGeneral(whereFiltros(req), req.empresaId!);
  res.json(datos);
}

export interface DatosEstadoResultados {
  ingresos: GrupoBalance[];
  costos: GrupoBalance[];
  gastos: GrupoBalance[];
  totalIngresos: number;
  totalCostos: number;
  totalGastos: number;
  resultado: number;
}

export async function datosEstadoResultados(where: Prisma.ComprobanteWhereInput, empresaId: string): Promise<DatosEstadoResultados> {
  const saldos = await saldosPorCuenta(where);
  const nombres = await nombreGrupos(empresaId);

  const ingresos = construirSeccion(agruparPorClase(saldos, [4]), nombres);
  const costos = construirSeccion(agruparPorClase(saldos, [6]), nombres);
  const gastos = construirSeccion(agruparPorClase(saldos, [5]), nombres);

  const totalIngresos = ingresos.reduce((s, g) => s + g.total, 0);
  const totalCostos = costos.reduce((s, g) => s + g.total, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.total, 0);

  return {
    ingresos,
    costos,
    gastos,
    totalIngresos,
    totalCostos,
    totalGastos,
    resultado: totalIngresos - totalCostos - totalGastos,
  };
}

export async function estadoResultados(req: Request, res: Response): Promise<void> {
  const datos = await datosEstadoResultados(whereFiltros(req), req.empresaId!);
  res.json(datos);
}
