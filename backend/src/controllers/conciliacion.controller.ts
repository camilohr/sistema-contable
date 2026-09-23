import { Request, Response } from "express";
import { z } from "zod";
import { EstadoConciliacion, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { uploadCsv } from "../lib/multer.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { marcarActividadProceso } from "../lib/procesos.js";
import { importarOrquestado, resolverCuentaBanco, saldoLibrosAcumulado, asientosBancoPeriodo, cruzarMovimientos } from "../lib/conciliacion.js";

const crearConciliacionSchema = z.object({
  periodoId: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive().optional(),
});

export const importarExtractoUpload = uploadCsv.single("archivo");

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
  const r = await importarOrquestado({
    empresaId: req.empresaId!,
    usuarioId: req.user!.sub,
    body: req.body,
    archivo: req.file,
  });
  res.status(r.status).json(r.body);
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