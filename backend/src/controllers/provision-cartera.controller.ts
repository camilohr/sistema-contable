import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, EstadoComprobante, EstadoPeriodo, TipoActividadProceso, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { crearComprobanteDiario } from "../lib/comprobantes.js";
import { marcarActividadProceso } from "../lib/procesos.js";

const CUENTA_PROVISION = "1399";
const CUENTA_GASTO = "5199";

const redondear2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: { toNumber(): number } | number): number => (typeof v === "number" ? v : v.toNumber());

const parametroSchema = z.object({
  diasDesde: z.number().int().min(0),
  diasHasta: z.number().int().min(0).nullable().optional(),
  porcentaje: z.number().min(0).max(100),
});

const actualizarParametrosSchema = z.object({
  parametros: z.array(parametroSchema).min(1),
});

function validarRangos(parametros: z.infer<typeof parametroSchema>[]): string | null {
  const pares = parametros.map((p) => `${p.diasDesde}-${p.diasHasta ?? "null"}`);
  if (new Set(pares).size !== pares.length) {
    return "No puede haber rangos de días duplicados";
  }
  const ordenados = [...parametros].sort((a, b) => a.diasDesde - b.diasDesde);
  for (let i = 0; i < ordenados.length; i++) {
    const p = ordenados[i];
    if (p.diasHasta !== null && p.diasHasta !== undefined && p.diasHasta < p.diasDesde) {
      return `El rango que inicia en ${p.diasDesde} días tiene un límite superior menor al inferior`;
    }
  }
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1];
    const actual = ordenados[i];
    if (anterior.diasHasta === null || anterior.diasHasta === undefined) {
      return "Solo el último rango puede no tener límite superior";
    }
    if (actual.diasDesde <= anterior.diasHasta) {
      return "Los rangos de días no pueden solaparse";
    }
  }
  return null;
}

function serializarParametro(p: { id: number; diasDesde: number; diasHasta: number | null; porcentaje: { toNumber(): number } }) {
  return { id: p.id, diasDesde: p.diasDesde, diasHasta: p.diasHasta, porcentaje: num(p.porcentaje) };
}

export async function obtenerParametros(req: Request, res: Response): Promise<void> {
  const filas = await prisma.parametroProvision.findMany({
    where: { OR: [{ empresaId: null }, { empresaId: req.empresaId }] },
    orderBy: { diasDesde: "asc" },
  });
  const porRango = new Map<string, (typeof filas)[number]>();
  for (const p of filas) {
    const key = `${p.diasDesde}-${p.diasHasta ?? ""}`;
    if (!porRango.has(key) || p.empresaId === req.empresaId) porRango.set(key, p);
  }
  res.json([...porRango.values()].sort((a, b) => a.diasDesde - b.diasDesde).map(serializarParametro));
}

export async function actualizarParametros(req: Request, res: Response): Promise<void> {
  const parsed = actualizarParametrosSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const parametros = parsed.data.parametros;
  const error = validarRangos(parametros);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const guardados = await prisma.$transaction(async (tx) => {
    await tx.parametroProvision.deleteMany({ where: { empresaId: req.empresaId } });
    await tx.parametroProvision.createMany({
      data: parametros.map((p) => ({
        empresaId: req.empresaId,
        diasDesde: p.diasDesde,
        diasHasta: p.diasHasta ?? null,
        porcentaje: new Prisma.Decimal(p.porcentaje),
      })),
    });
    return tx.parametroProvision.findMany({
      where: { empresaId: req.empresaId },
      orderBy: { diasDesde: "asc" },
    });
  });
  res.json(guardados.map(serializarParametro));
}

async function saldoCuenta(codigo: string, empresaId: string): Promise<number> {
  const asientos = await prisma.asiento.findMany({
    where: {
      cuenta: { codigo },
      comprobante: { estado: EstadoComprobante.CONTABILIZADO, empresaId },
    },
    select: { debito: true, credito: true },
  });
  return redondear2(asientos.reduce((s, a) => s + (num(a.credito) - num(a.debito)), 0));
}

export async function calcularProvision(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) {
    res.status(404).json({ error: `No existe el periodo ${periodoId}` });
    return;
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    res.status(400).json({ error: "El periodo está cerrado" });
    return;
  }

  const existente = await prisma.provisionCartera.findUnique({
    where: { periodoId },
    include: { comprobante: { select: { estado: true } } },
  });
  if (existente) {
    if (existente.comprobanteId === null || existente.comprobante?.estado === EstadoComprobante.ANULADO || existente.comprobante?.estado === EstadoComprobante.BORRADOR) {
      // BORRADOR y ANULADO se pueden recalcular (S1-15). Solo se elimina el
      // comprobante BORRADOR; el ANULADO queda como pista de auditoría.
      if (existente.comprobante?.estado === EstadoComprobante.BORRADOR && existente.comprobanteId) {
        await prisma.$transaction(async (tx) => {
          await tx.provisionCartera.delete({ where: { id: existente.id } });
          await tx.comprobante.delete({ where: { id: existente.comprobanteId! } });
        });
      } else {
        await prisma.provisionCartera.delete({ where: { id: existente.id } });
      }
    } else {
      res.status(400).json({ error: "La provisión de cartera para este periodo ya fue contabilizada; anule el comprobante para recalcular" });
      return;
    }
  }

  const cuentas = await prisma.cuenta.findMany({
    where: { codigo: { in: [CUENTA_PROVISION, CUENTA_GASTO] }, OR: [{ empresaId: null }, { empresaId }] },
  });
  const cuentaProvision = cuentas.find((c) => c.codigo === CUENTA_PROVISION);
  const cuentaGasto = cuentas.find((c) => c.codigo === CUENTA_GASTO);
  if (!cuentaProvision || !cuentaGasto) {
    res.status(400).json({ error: `No se encontraron las cuentas ${CUENTA_PROVISION} (Provisión de cartera) y ${CUENTA_GASTO} (Gasto de provisión); verifique el catálogo` });
    return;
  }
  if (!cuentaProvision.permiteMovimiento || !cuentaGasto.permiteMovimiento || !cuentaProvision.activa || !cuentaGasto.activa) {
    res.status(400).json({ error: `Las cuentas ${CUENTA_PROVISION} y ${CUENTA_GASTO} deben estar activas y permitir movimiento` });
    return;
  }

  const parametros = await prisma.parametroProvision.findMany({
    where: { OR: [{ empresaId: null }, { empresaId }] },
    orderBy: { diasDesde: "asc" },
  });
  if (parametros.length === 0) {
    res.status(400).json({ error: "Configure los parámetros de provisión antes de calcular" });
    return;
  }
  const porRango = new Map<string, (typeof parametros)[number]>();
  for (const p of parametros) {
    const key = `${p.diasDesde}-${p.diasHasta ?? ""}`;
    if (!porRango.has(key) || p.empresaId === empresaId) porRango.set(key, p);
  }
  const parametrosEfectivos = [...porRango.values()].sort((a, b) => a.diasDesde - b.diasDesde);

  const documentos = await prisma.cuentaPorCobrar.findMany({
    where: { empresaId, estado: { in: ["PENDIENTE", "VENCIDA", "ABONADA"] } },
    select: {
      id: true,
      numeroDocumento: true,
      tercero: { select: { nombreRazonSocial: true, documento: true } },
      fechaVencimiento: true,
      saldo: true,
    },
  });

  interface Linea {
    documentoId: number;
    numeroDocumento: string;
    tercero: string;
    saldo: number;
    diasMora: number;
    porcentaje: number;
    provision: number;
  }

  const lineas: Linea[] = [];
  let requerido = 0;
  const refFin = periodo.fechaFin.getTime();
  for (const doc of documentos) {
    const saldo = num(doc.saldo);
    if (saldo <= 0) continue;
    const diasMora = Math.floor((refFin - doc.fechaVencimiento.getTime()) / 86400000);
    if (diasMora <= 0) continue;
    const parametro = parametrosEfectivos.find((p) => p.diasDesde <= diasMora && (p.diasHasta === null || diasMora <= p.diasHasta));
    if (!parametro) continue;
    const porcentaje = num(parametro.porcentaje);
    const provision = redondear2(saldo * (porcentaje / 100));
    if (provision <= 0) continue;
    requerido = redondear2(requerido + provision);
    lineas.push({
      documentoId: doc.id,
      numeroDocumento: doc.numeroDocumento,
      tercero: doc.tercero.nombreRazonSocial,
      saldo,
      diasMora,
      porcentaje,
      provision,
    });
  }
  requerido = redondear2(requerido);

  const balanceProvision = await saldoCuenta(CUENTA_PROVISION, empresaId);
  const incremental = redondear2(requerido - balanceProvision);

  const usuarioId = req.user!.sub;
  const asientos =
    incremental > 0
      ? [
          { cuentaId: cuentaGasto.id, debito: incremental, credito: 0, detalle: `Provisión de cartera ${periodo.nombre}` },
          { cuentaId: cuentaProvision.id, debito: 0, credito: incremental, detalle: `Provisión de cartera ${periodo.nombre}` },
        ]
      : [
          { cuentaId: cuentaProvision.id, debito: Math.abs(incremental), credito: 0, detalle: `Reversión de provisión de cartera ${periodo.nombre}` },
          { cuentaId: cuentaGasto.id, debito: 0, credito: Math.abs(incremental), detalle: `Reversión de provisión de cartera ${periodo.nombre}` },
        ];

  const resultado = await prisma.$transaction(async (tx) => {
    let comprobanteId: number | null = null;
    if (incremental !== 0) {
      const comprobante = await crearComprobanteDiario(tx, {
        empresaId,
        periodoId,
        fecha: periodo.fechaFin,
        concepto: incremental > 0 ? `Provisión de cartera ${periodo.nombre}` : `Reversión de provisión de cartera ${periodo.nombre}`,
        usuarioId,
        asientos,
        // S1-15: queda en BORRADOR hasta que un segundo revisor lo contabilice.
        estado: EstadoComprobante.BORRADOR,
      });
      comprobanteId = comprobante.id;
    }
    const provision = await tx.provisionCartera.create({
      data: {
        periodoId,
        comprobanteId,
        totalCalculado: new Prisma.Decimal(requerido),
      },
      include: {
        comprobante: { include: { asientos: { include: { cuenta: { select: { codigo: true } } } } } },
      },
    });
    await registrarAuditoria(tx, {
      usuarioId,
      empresaId,
      accion: AccionAuditoria.CALCULAR_PROVISION,
      entidad: "ProvisionCartera",
      entidadId: provision.id,
      detalle: {
        periodo: periodo.nombre,
        totalCalculado: requerido,
        balanceProvision,
        incremental,
        comprobanteId,
      },
    });
    await marcarActividadProceso(tx, empresaId, periodo.fechaFin.getFullYear(), TipoActividadProceso.PROVISION_CARTERA);
    return provision;
  });

  res.status(201).json({
    provision: {
      id: resultado.id,
      periodoId,
      totalCalculado: num(resultado.totalCalculado),
      comprobanteId: resultado.comprobanteId,
    },
    resumen: { requerido, balanceProvision, incremental },
    comprobante: resultado.comprobante
      ? {
          id: resultado.comprobante.id,
          tipo: resultado.comprobante.tipo,
          consecutivo: resultado.comprobante.consecutivo,
          fecha: resultado.comprobante.fecha.toISOString().slice(0, 10),
          concepto: resultado.comprobante.concepto,
          estado: resultado.comprobante.estado,
          totalDebito: num(resultado.comprobante.totalDebito),
          totalCredito: num(resultado.comprobante.totalCredito),
          numAsientos: resultado.comprobante.asientos.length,
          asientos: resultado.comprobante.asientos.map((a) => ({
            codigoCuenta: (a as { cuenta?: { codigo: string } }).cuenta?.codigo,
            debito: num(a.debito),
            credito: num(a.credito),
            detalle: a.detalle,
          })),
        }
      : null,
    lineas,
  });
}

export async function contabilizar(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) {
    res.status(404).json({ error: `No existe el periodo ${periodoId}` });
    return;
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    res.status(400).json({ error: "El periodo está cerrado" });
    return;
  }
  const provision = await prisma.provisionCartera.findUnique({
    where: { periodoId },
    include: { comprobante: true },
  });
  if (!provision) {
    res.status(400).json({ error: "Primero calcule la provisión del periodo (queda en borrador)" });
    return;
  }
  if (provision.comprobanteId === null) {
    res.status(200).json({ ok: true, mensaje: "La provisión no generó comprobante (sin variación) y ya está registrada" });
    return;
  }
  const comprobante = provision.comprobante!;
  if (comprobante.estado === EstadoComprobante.CONTABILIZADO) {
    res.status(400).json({ error: "La provisión del periodo ya está contabilizada" });
    return;
  }
  if (comprobante.estado !== EstadoComprobante.BORRADOR) {
    res.status(400).json({ error: "El comprobante de provisión no está en borrador" });
    return;
  }

  const usuarioId = req.user!.sub;
  const resultado = await prisma.$transaction(async (tx) => {
    const c = await tx.comprobante.update({
      where: { id: comprobante.id },
      data: { estado: EstadoComprobante.CONTABILIZADO },
      include: { asientos: { include: { cuenta: { select: { codigo: true } } } }, periodo: true },
    });
    await registrarAuditoria(tx, {
      usuarioId,
      empresaId,
      accion: AccionAuditoria.CONTABILIZAR,
      entidad: "Comprobante",
      entidadId: comprobante.id,
      detalle: { consecutivo: c.consecutivo, concepto: c.concepto, origen: "provision-cartera", periodo: periodo.nombre },
    });
    await marcarActividadProceso(tx, empresaId, periodo.fechaFin.getFullYear(), TipoActividadProceso.PROVISION_CARTERA);
    return c;
  });

  res.status(200).json({
    comprobante: {
      id: resultado.id,
      tipo: resultado.tipo,
      consecutivo: resultado.consecutivo,
      concepto: resultado.concepto,
      estado: resultado.estado,
      totalDebito: num(resultado.totalDebito),
      totalCredito: num(resultado.totalCredito),
      numAsientos: resultado.asientos.length,
    },
    totalCalculado: num(provision.totalCalculado),
  });
}

export async function obtenerProvision(req: Request, res: Response): Promise<void> {
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId: req.empresaId } });
  if (!periodo) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }
  const provision = await prisma.provisionCartera.findUnique({
    where: { periodoId },
    include: {
      periodo: { select: { nombre: true } },
      comprobante: {
        include: { asientos: { include: { cuenta: { select: { codigo: true, nombre: true } } } } },
      },
    },
  });
  if (!provision) {
    res.status(404).json({ error: `No hay provisión calculada para el periodo ${periodoId}` });
    return;
  }
  res.json({
    id: provision.id,
    periodoId,
    periodo: provision.periodo.nombre,
    fecha: provision.fecha.toISOString(),
    totalCalculado: num(provision.totalCalculado),
    comprobanteId: provision.comprobanteId,
    comprobante: provision.comprobante
      ? {
          id: provision.comprobante.id,
          tipo: provision.comprobante.tipo,
          consecutivo: provision.comprobante.consecutivo,
          fecha: provision.comprobante.fecha.toISOString().slice(0, 10),
          concepto: provision.comprobante.concepto,
          totalDebito: num(provision.comprobante.totalDebito),
          totalCredito: num(provision.comprobante.totalCredito),
          estado: provision.comprobante.estado,
          asientos: provision.comprobante.asientos.map((a) => ({
            codigoCuenta: a.cuenta.codigo,
            nombreCuenta: a.cuenta.nombre,
            debito: num(a.debito),
            credito: num(a.credito),
            detalle: a.detalle,
          })),
        }
      : null,
  });
}

export const provision = { obtenerParametros, actualizarParametros, calcularProvision, contabilizar, obtenerProvision };
