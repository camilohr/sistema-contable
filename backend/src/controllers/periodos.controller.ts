import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { marcarActividadProceso } from "../lib/procesos.js";
import { EstadoPeriodo, AccionAuditoria, TipoActividadProceso } from "@prisma/client";

const crearSchema = z.object({
  nombre: z.string().min(1),
  fechaInicio: z.string().min(1),
  fechaFin: z.string().min(1),
}).superRefine((val, ctx) => {
  const inicio = new Date(val.fechaInicio);
  const fin = new Date(val.fechaFin);
  if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fechas"], message: "Fechas inválidas" });
  } else if (fin < inicio) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fechaFin"], message: "La fecha fin debe ser posterior o igual a la fecha inicio" });
  }
});

const actualizarSchema = z.object({
  estado: z.nativeEnum(EstadoPeriodo).optional(),
  nombre: z.string().min(1).optional(),
});

export async function listar(req: Request, res: Response): Promise<void> {
  const estado = req.query.estado ? String(req.query.estado) : undefined;
  const where: Record<string, unknown> = { empresaId: req.empresaId };
  if (estado && (Object.values(EstadoPeriodo) as string[]).includes(estado)) where.estado = estado;

  const periodos = await prisma.periodo.findMany({
    where,
    orderBy: [{ fechaInicio: "desc" }],
    include: {
      _count: {
        select: {
          comprobantes: true,
          presupuestos: true,
          conciliaciones: true,
          nominas: true,
          provisionesNomina: true,
          depreciaciones: true,
          provisionesCartera: true,
        },
      },
    },
  });
  res.json(periodos);
}

export async function crear(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const { nombre, fechaInicio, fechaFin } = parsed.data;

  const duplicado = await prisma.periodo.findFirst({
    where: { empresaId, nombre },
  });
  if (duplicado) {
    res.status(409).json({ error: `Ya existe un periodo llamado ${nombre}` });
    return;
  }

  const periodo = await prisma.periodo.create({
    data: { empresaId, nombre, fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin) },
  });
  res.status(201).json(periodo);
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const id = Number(req.params.id);
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const existe = await prisma.periodo.findFirst({ where: { id, empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }
  if (parsed.data.estado === EstadoPeriodo.ABIERTO) {
    const anio = existe.fechaFin.getFullYear();
    const cierre = await prisma.cierreAnual.findFirst({ where: { empresaId, anio } });
    if (cierre) {
      res.status(400).json({ error: `No se puede reabrir un periodo de un año ya cerrado (${anio})` });
      return;
    }
  }
  const periodo = await prisma.$transaction(async (tx) => {
    const p = await tx.periodo.update({ where: { id }, data: parsed.data });
    if (parsed.data.estado && parsed.data.estado !== existe.estado) {
      await registrarAuditoria(tx, {
        usuarioId: req.user!.sub,
        empresaId,
        accion: parsed.data.estado === EstadoPeriodo.CERRADO ? AccionAuditoria.CERRAR_PERIODO : AccionAuditoria.REABRIR_PERIODO,
        entidad: "Periodo",
        entidadId: id,
        detalle: { nombre: p.nombre },
      });
      if (parsed.data.estado === EstadoPeriodo.CERRADO) {
        const anio = p.fechaFin.getFullYear();
        await marcarActividadProceso(tx, empresaId, anio, TipoActividadProceso.CIERRE_PERIODO);
        await marcarActividadProceso(tx, empresaId, anio, TipoActividadProceso.COMPROBANTES);
      }
    }
    return p;
  });
  res.json(periodo);
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existe = await prisma.periodo.findFirst({
    where: { id, empresaId: req.empresaId },
    include: {
      _count: {
        select: {
          comprobantes: true,
          presupuestos: true,
          conciliaciones: true,
          nominas: true,
          provisionesNomina: true,
          depreciaciones: true,
          provisionesCartera: true,
        },
      },
    },
  });
  if (!existe) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }
  const dependencias = Object.entries(existe._count)
    .filter(([, n]) => n > 0)
    .map(([k]) => k);
  if (dependencias.length > 0) {
    res.status(400).json({ error: `No se puede eliminar: el periodo tiene ${dependencias.join(", ")}.` });
    return;
  }
  await prisma.periodo.delete({ where: { id } });
  res.json({ ok: true });
}
