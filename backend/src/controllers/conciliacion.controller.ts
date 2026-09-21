import { Request, Response } from "express";
import { z } from "zod";
import { EstadoComprobante, EstadoConciliacion, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { uploadCsv } from "../lib/multer.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { marcarActividadProceso } from "../lib/procesos.js";
import { parsearExtractoCsv, cruzarMovimientos, hashMovimiento, MapaColumnas } from "../lib/conciliacion.js";

const crearConciliacionSchema = z.object({
  periodoId: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive().optional(),
});

const importarConciliacionSchema = z.object({
  periodoId: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive().optional(),
  fechaCol: z.coerce.number().int().nonnegative().optional(),
  referenciaCol: z.coerce.number().int().nonnegative().optional(),
  descripcionCol: z.coerce.number().int().nonnegative().optional(),
  debitoCol: z.coerce.number().int().nonnegative().optional(),
  creditoCol: z.coerce.number().int().nonnegative().optional(),
  saldoCol: z.coerce.number().int().nonnegative().optional(),
});

export const importarExtractoUpload = uploadCsv.single("archivo");

async function resolverCuentaBanco(empresaId: string, cuentaId?: number): Promise<number | null> {
  if (cuentaId) {
    const cuenta = await prisma.cuenta.findFirst({ where: { id: cuentaId, OR: [{ empresaId }, { empresaId: null }] } });
    return cuenta ? cuenta.id : null;
  }
  const cuenta = await prisma.cuenta.findFirst({
    where: { codigo: { startsWith: "1110" }, OR: [{ empresaId: null }, { empresaId }], activa: true },
    orderBy: { codigo: "asc" },
  });
  return cuenta?.id ?? null;
}

export async function saldoLibrosAcumulado(empresaId: string, cuentaId: number, fechaCorte: Date): Promise<number> {
  const comprobantes = await prisma.comprobante.findMany({
    where: { empresaId, estado: EstadoComprobante.CONTABILIZADO, fecha: { lte: fechaCorte } },
    select: { asientos: { where: { cuentaId }, select: { debito: true, credito: true } } },
  });
  let debitos = 0;
  let creditos = 0;
  for (const c of comprobantes) {
    for (const a of c.asientos) {
      debitos += a.debito.toNumber();
      creditos += a.credito.toNumber();
    }
  }
  return debitos - creditos;
}

async function asientosBancoPeriodo(empresaId: string, cuentaId: number, fechaInicio: Date, fechaFin: Date) {
  const asientos = await prisma.asiento.findMany({
    where: {
      cuentaId,
      comprobante: { empresaId, estado: EstadoComprobante.CONTABILIZADO, fecha: { gte: fechaInicio, lte: fechaFin } },
    },
    select: { id: true, debito: true, credito: true, detalle: true },
  });
  return asientos.map((a) => ({ id: a.id, debito: a.debito.toNumber(), credito: a.credito.toNumber(), detalle: a.detalle }));
}

export async function listar(req: Request, res: Response): Promise<void> {
  const periodoId = req.query.periodoId ? Number(req.query.periodoId) : undefined;
  const cuentaId = req.query.cuentaId ? Number(req.query.cuentaId) : undefined;
  const where: Record<string, unknown> = { empresaId: req.empresaId };
  if (periodoId) where.periodoId = periodoId;
  if (cuentaId) where.cuentaId = cuentaId;

  const conciliaciones = await prisma.conciliacion.findMany({
    where,
    include: {
      periodo: { select: { nombre: true } },
      cuenta: { select: { codigo: true, nombre: true } },
      _count: { select: { movimientos: true } },
    },
    orderBy: [{ periodoId: "desc" }, { id: "desc" }],
  });
  res.json(conciliaciones);
}

export async function detalle(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const conciliacion = await prisma.conciliacion.findFirst({
    where: { id, empresaId: req.empresaId! },
    include: {
      periodo: { select: { nombre: true, fechaInicio: true, fechaFin: true } },
      cuenta: { select: { codigo: true, nombre: true } },
      aprobador: { select: { nombre: true } },
      movimientos: { orderBy: { fecha: "asc" } },
    },
  });
  if (!conciliacion) {
    res.status(404).json({ error: "Conciliación no encontrada" });
    return;
  }
  res.json(conciliacion);
}

export async function crear(req: Request, res: Response): Promise<void> {
  const parsed = crearConciliacionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten().fieldErrors });
    return;
  }
  const { periodoId, cuentaId: cuentaIdProp } = parsed.data;
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId: req.empresaId } });
  if (!periodo) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }
  const cuentaId = await resolverCuentaBanco(req.empresaId!, cuentaIdProp);
  if (!cuentaId) {
    res.status(404).json({ error: "No se encontró una cuenta de bancos (1110) para conciliar" });
    return;
  }
  const saldo = await saldoLibrosAcumulado(req.empresaId!, cuentaId, periodo.fechaFin);

  const conciliacion = await prisma.conciliacion.upsert({
    where: { empresaId_periodoId_cuentaId: { empresaId: req.empresaId!, periodoId, cuentaId } },
    update: { saldoLibros: saldo },
    create: { empresaId: req.empresaId!, periodoId, cuentaId, saldoLibros: saldo },
  });
  res.status(201).json(conciliacion);
}

export async function importar(req: Request, res: Response): Promise<void> {
  const parsed = importarConciliacionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten().fieldErrors });
    return;
  }
  const { periodoId, cuentaId: cuentaIdProp, fechaCol, referenciaCol, descripcionCol, debitoCol, creditoCol, saldoCol } = parsed.data;
  const archivo = req.file;

  if (!archivo) {
    res.status(400).json({ error: "No se recibió el archivo CSV (campo 'archivo')" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId: req.empresaId } });
  if (!periodo) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }
  const cuentaId = await resolverCuentaBanco(req.empresaId!, cuentaIdProp);
  if (!cuentaId) {
    res.status(404).json({ error: "No se encontró una cuenta de bancos (1110) para conciliar" });
    return;
  }

  const mapa: MapaColumnas = {
    fecha: fechaCol,
    referencia: referenciaCol,
    descripcion: descripcionCol,
    debito: debitoCol,
    credito: creditoCol,
    saldo: saldoCol,
  };

  const texto = archivo.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const { movimientos, errores } = parsearExtractoCsv(texto, mapa);
  if (movimientos.length === 0) {
    res.status(400).json({ error: `No se pudo leer el extracto: ${errores.join("; ") || "archivo vacío o sin filas válidas"}` });
    return;
  }

  const saldo = await saldoLibrosAcumulado(req.empresaId!, cuentaId, periodo.fechaFin);
  const saldoExtracto = movimientos[movimientos.length - 1].saldo;

  const conciliacion = await prisma.conciliacion.upsert({
    where: { empresaId_periodoId_cuentaId: { empresaId: req.empresaId!, periodoId, cuentaId } },
    update: { saldoExtracto, saldoLibros: saldo, estado: EstadoConciliacion.EN_PROCESO },
    create: { empresaId: req.empresaId!, periodoId, cuentaId, saldoExtracto, saldoLibros: saldo, estado: EstadoConciliacion.EN_PROCESO },
  });

  const asientos = await asientosBancoPeriodo(req.empresaId!, cuentaId, periodo.fechaInicio, periodo.fechaFin);
  const registros = movimientos.map((m) => ({ ...m, hashMovimiento: hashMovimiento(m) }));
  const existentes = await prisma.movimientoExtracto.findMany({
    where: { conciliacionId: conciliacion.id, hashMovimiento: { in: registros.map((r) => r.hashMovimiento) } },
    select: { id: true, hashMovimiento: true, asientoId: true },
  });
  const hashExistentes = new Set(existentes.map((e) => e.hashMovimiento));

  const aCrear = registros.filter((r) => !hashExistentes.has(r.hashMovimiento));
  if (aCrear.length > 0) {
    await prisma.movimientoExtracto.createMany({
      data: aCrear.map((r) => ({
        conciliacionId: conciliacion.id,
        fecha: r.fecha,
        referencia: r.referencia,
        descripcion: r.descripcion,
        debito: r.debito,
        credito: r.credito,
        saldo: r.saldo,
        hashMovimiento: r.hashMovimiento,
      })),
    });
  }

  const conciliados = await prisma.movimientoExtracto.findMany({
    where: { conciliacionId: conciliacion.id },
    select: { id: true, debito: true, credito: true, asientoId: true },
  });
  const asignacion = cruzarMovimientos(
    conciliados.filter((m) => !m.asientoId).map((m) => ({ id: m.id, debito: m.debito.toNumber(), credito: m.credito.toNumber() })),
    asientos
  );
  for (const [movId, asientoId] of asignacion) {
    await prisma.movimientoExtracto.update({ where: { id: movId }, data: { conciliado: true, asientoId } });
  }
  const diferencia = Math.round((saldoExtracto - saldo) * 100) / 100;
  await prisma.conciliacion.update({ where: { id: conciliacion.id }, data: { diferencia } });

  await registrarAuditoria(prisma, {
    usuarioId: req.user!.sub,
    empresaId: req.empresaId,
    accion: AccionAuditoria.IMPORTAR_EXTRACTO,
    entidad: "CONCILIACION",
    entidadId: conciliacion.id,
    detalle: { filasImportadas: aCrear.length, total: movimientos.length, errores: errores.slice(0, 10) },
  });

  res.status(201).json({
    conciliacion: { ...conciliacion, diferencia },
    importadas: aCrear.length,
    totalArchivo: movimientos.length,
    errores: errores.slice(0, 20),
    movimientos: conciliados.length,
    conciliados: conciliados.filter((m) => m.asientoId || asignacion.has(m.id)).length,
  });
}

export async function cruzar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const conciliacion = await prisma.conciliacion.findFirst({
    where: { id, empresaId: req.empresaId! },
    include: { periodo: true },
  });
  if (!conciliacion) {
    res.status(404).json({ error: "Conciliación no encontrada" });
    return;
  }
  const asientos = await asientosBancoPeriodo(req.empresaId!, conciliacion.cuentaId, conciliacion.periodo.fechaInicio, conciliacion.periodo.fechaFin);
  const movimientos = await prisma.movimientoExtracto.findMany({ where: { conciliacionId: id }, select: { id: true, debito: true, credito: true } });
  const asignacion = cruzarMovimientos(
    movimientos.map((m) => ({ id: m.id, debito: m.debito.toNumber(), credito: m.credito.toNumber() })),
    asientos
  );
  for (const mv of movimientos) {
    const asientoId = asignacion.get(mv.id) ?? null;
    await prisma.movimientoExtracto.update({ where: { id: mv.id }, data: { conciliado: Boolean(asientoId), asientoId } });
  }
  res.json({ conciliados: asignacion.size, total: movimientos.length });
}

export async function aprobar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const conciliacion = await prisma.conciliacion.findFirst({
    where: { id, empresaId: req.empresaId! },
    include: { periodo: true, cuenta: { select: { codigo: true } } },
  });
  if (!conciliacion) {
    res.status(404).json({ error: "Conciliación no encontrada" });
    return;
  }
  if (conciliacion.estado === EstadoConciliacion.APROBADA) {
    res.status(409).json({ error: "La conciliación ya está aprobada" });
    return;
  }
  const diferencia = Math.round((conciliacion.saldoExtracto.toNumber() - conciliacion.saldoLibros.toNumber()) * 100) / 100;

  const actualizada = await prisma.conciliacion.update({
    where: { id },
    data: { estado: EstadoConciliacion.APROBADA, aprobadaPor: req.user!.sub, aprobadaEn: new Date(), diferencia },
  });
  await marcarActividadProceso(prisma, req.empresaId!, conciliacion.periodo.fechaFin.getFullYear(), "CONCILIACION", new Date());
  await registrarAuditoria(prisma, {
    usuarioId: req.user!.sub,
    empresaId: req.empresaId,
    accion: AccionAuditoria.APROBAR_CONCILIACION,
    entidad: "CONCILIACION",
    entidadId: id,
    detalle: { periodo: conciliacion.periodo.nombre, cuenta: conciliacion.cuenta.codigo, diferencia },
  });
  res.json(actualizada);
}

export async function anular(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const conciliacion = await prisma.conciliacion.findFirst({ where: { id, empresaId: req.empresaId! } });
  if (!conciliacion) {
    res.status(404).json({ error: "Conciliación no encontrada" });
    return;
  }
  const actualizada = await prisma.conciliacion.update({
    where: { id },
    data: { estado: EstadoConciliacion.ANULADA },
  });
  await registrarAuditoria(prisma, {
    usuarioId: req.user!.sub,
    empresaId: req.empresaId,
    accion: AccionAuditoria.ANULAR_CONCILIACION,
    entidad: "CONCILIACION",
    entidadId: id,
  });
  res.json(actualizada);
}
