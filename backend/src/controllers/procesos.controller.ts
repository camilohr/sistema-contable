import { Request, Response } from "express";
import { z } from "zod";
import { AccionAuditoria, EstadoProceso } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { crearProcesoConPlantilla } from "../lib/procesos.js";
import { registrarAuditoria } from "../lib/auditoria.js";

const crearSchema = z.object({
  anio: z.number().int().min(2000).max(2100),
});

const actualizarSchema = z.object({
  estado: z.nativeEnum(EstadoProceso),
});

const actividadSchema = z
  .object({
    estado: z.boolean().optional(),
    fechaEsperada: z.string().nullable().optional(),
  })
  .refine((v) => v.estado !== undefined || v.fechaEsperada !== undefined, {
    message: "Debe indicar estado o fecha esperada",
  });

const notaSchema = z.object({
  texto: z.string().min(1).max(5000),
});

interface ActividadResumen {
  id: number;
  tipo: string;
  orden: number;
  estado: boolean;
  fechaEsperada: string | null;
  fechaReal: string | null;
}

function serializarProceso(p: {
  id: string;
  anio: number;
  estado: EstadoProceso;
  createdAt: Date;
  updatedAt: Date;
  actividades: { estado: boolean }[];
  _count?: { notas?: number };
}) {
  const total = p.actividades.length;
  const completadas = p.actividades.filter((a) => a.estado).length;
  return {
    id: p.id,
    anio: p.anio,
    estado: p.estado,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    avance: { total, completadas, porcentaje: total > 0 ? Math.round((completadas / total) * 100) : 0 },
    notas: p._count?.notas ?? 0,
  };
}

function serializarActividad(a: {
  id: number;
  tipo: string;
  orden: number;
  estado: boolean;
  fechaEsperada: Date | null;
  fechaReal: Date | null;
}): ActividadResumen {
  return {
    id: a.id,
    tipo: a.tipo,
    orden: a.orden,
    estado: a.estado,
    fechaEsperada: a.fechaEsperada ? a.fechaEsperada.toISOString().slice(0, 10) : null,
    fechaReal: a.fechaReal ? a.fechaReal.toISOString().slice(0, 10) : null,
  };
}

export async function listar(req: Request, res: Response): Promise<void> {
  const procesos = await prisma.procesoContable.findMany({
    where: { empresaId: req.empresaId },
    orderBy: { anio: "desc" },
    include: {
      actividades: { select: { estado: true } },
      _count: { select: { notas: true } },
    },
  });
  res.json(procesos.map(serializarProceso));
}

export async function crear(req: Request, res: Response): Promise<void> {
  const parsed = crearSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const { anio } = parsed.data;

  const existente = await prisma.procesoContable.findUnique({
    where: { empresaId_anio: { empresaId: req.empresaId, anio } },
  });
  if (existente) {
    res.status(409).json({ error: `Ya existe un proceso para el año ${anio}` });
    return;
  }

  const proceso = await prisma.$transaction(async (tx) => {
    const p = await crearProcesoConPlantilla(tx, req.empresaId, anio);
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.CREAR_PROCESO,
      entidad: "ProcesoContable",
      entidadId: p.id,
      detalle: { anio },
    });
    return p;
  });
  res.status(201).json({
    id: proceso.id,
    anio: proceso.anio,
    estado: proceso.estado,
    createdAt: proceso.createdAt.toISOString(),
    updatedAt: proceso.updatedAt.toISOString(),
    actividades: proceso.actividades.map(serializarActividad),
  });
}

export async function obtener(req: Request, res: Response): Promise<void> {
  const proceso = await prisma.procesoContable.findFirst({
    where: { id: req.params.id, empresaId: req.empresaId },
    include: {
      actividades: { orderBy: { orden: "asc" } },
      notas: {
        orderBy: { createdAt: "desc" },
        include: { usuario: { select: { nombre: true } } },
      },
    },
  });
  if (!proceso) {
    res.status(404).json({ error: "Proceso no encontrado" });
    return;
  }
  const total = proceso.actividades.length;
  const completadas = proceso.actividades.filter((a) => a.estado).length;
  res.json({
    id: proceso.id,
    anio: proceso.anio,
    estado: proceso.estado,
    createdAt: proceso.createdAt.toISOString(),
    updatedAt: proceso.updatedAt.toISOString(),
    avance: { total, completadas, porcentaje: total > 0 ? Math.round((completadas / total) * 100) : 0 },
    actividades: proceso.actividades.map(serializarActividad),
    notas: proceso.notas.map((n) => ({
      id: n.id,
      texto: n.texto,
      createdAt: n.createdAt.toISOString(),
      usuario: n.usuario.nombre,
    })),
  });
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const parsed = actualizarSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const existe = await prisma.procesoContable.findFirst({
    where: { id: req.params.id, empresaId: req.empresaId },
    include: { actividades: { select: { estado: true } } },
  });
  if (!existe) {
    res.status(404).json({ error: "Proceso no encontrado" });
    return;
  }
  const proceso = await prisma.$transaction(async (tx) => {
    const p = await tx.procesoContable.update({
      where: { id: existe.id },
      data: { estado: parsed.data.estado },
      include: { actividades: { select: { estado: true } } },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.ACTUALIZAR_PROCESO,
      entidad: "ProcesoContable",
      entidadId: existe.id,
      detalle: { anio: existe.anio, estado: parsed.data.estado },
    });
    return p;
  });
  res.json(serializarProceso(proceso));
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const existe = await prisma.procesoContable.findFirst({
    where: { id: req.params.id, empresaId: req.empresaId },
  });
  if (!existe) {
    res.status(404).json({ error: "Proceso no encontrado" });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.procesoContable.delete({ where: { id: existe.id } });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.ELIMINAR_PROCESO,
      entidad: "ProcesoContable",
      entidadId: existe.id,
      detalle: { anio: existe.anio },
    });
  });
  res.json({ ok: true });
}

export async function marcarActividad(req: Request, res: Response): Promise<void> {
  const parsed = actividadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }

  const proceso = await prisma.procesoContable.findFirst({
    where: { id: req.params.id, empresaId: req.empresaId },
    include: { actividades: { where: { id: Number(req.params.actividadId) } } },
  });
  if (!proceso) {
    res.status(404).json({ error: "Proceso no encontrado" });
    return;
  }
  const actividad = proceso.actividades[0];
  if (!actividad) {
    res.status(404).json({ error: "Actividad no encontrada" });
    return;
  }

  const estado = parsed.data.estado ?? !actividad.estado;
  let fechaEsperada: Date | null = actividad.fechaEsperada;
  if (parsed.data.fechaEsperada !== undefined) {
    if (parsed.data.fechaEsperada === null) {
      fechaEsperada = null;
    } else {
      const d = new Date(parsed.data.fechaEsperada);
      if (isNaN(d.getTime())) {
        res.status(400).json({ error: "Fecha esperada inválida" });
        return;
      }
      fechaEsperada = d;
    }
  }

  const actualizada = await prisma.$transaction(async (tx) => {
    const a = await tx.actividadProceso.update({
      where: { id: actividad.id },
      data: { estado, fechaEsperada, fechaReal: estado ? new Date() : null },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.MARCAR_ACTIVIDAD,
      entidad: "ProcesoContable",
      entidadId: proceso.id,
      detalle: { actividadId: a.id, tipo: a.tipo, estado: a.estado },
    });
    return a;
  });
  res.json(serializarActividad(actualizada));
}

export async function agregarNota(req: Request, res: Response): Promise<void> {
  const parsed = notaSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const existe = await prisma.procesoContable.findFirst({
    where: { id: req.params.id, empresaId: req.empresaId },
  });
  if (!existe) {
    res.status(404).json({ error: "Proceso no encontrado" });
    return;
  }
  const nota = await prisma.$transaction(async (tx) => {
    const n = await tx.notaSeguimiento.create({
      data: { procesoId: existe.id, usuarioId: req.user!.sub, texto: parsed.data.texto },
      include: { usuario: { select: { nombre: true } } },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.AGREGAR_NOTA,
      entidad: "ProcesoContable",
      entidadId: existe.id,
      detalle: { notaId: n.id },
    });
    return n;
  });
  res.status(201).json({
    id: nota.id,
    texto: nota.texto,
    createdAt: nota.createdAt.toISOString(),
    usuario: nota.usuario.nombre,
  });
}

export async function cartera(req: Request, res: Response): Promise<void> {
  const rolGlobal = req.user!.rol;
  let filas: { id: string; nombre: string; nit: string; rol: string }[];
  if (rolGlobal === "ADMIN") {
    const todas = await prisma.empresa.findMany({
      where: { activa: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, nit: true },
    });
    filas = todas.map((e) => ({ id: e.id, nombre: e.nombre, nit: e.nit, rol: "ADMIN" }));
  } else {
    const vinculos = await prisma.usuarioEmpresa.findMany({
      where: { usuarioId: req.user!.sub, activo: true, empresa: { activa: true } },
      orderBy: { createdAt: "asc" },
      include: { empresa: { select: { id: true, nombre: true, nit: true } } },
    });
    filas = vinculos.map((v) => ({ id: v.empresa.id, nombre: v.empresa.nombre, nit: v.empresa.nit, rol: v.rol }));
  }
  const empresaIds = filas.map((f) => f.id);
  const procesos = await prisma.procesoContable.findMany({
    where: { empresaId: { in: empresaIds } },
    include: { actividades: { select: { estado: true } } },
    orderBy: { anio: "desc" },
  });
  const porEmpresa = new Map<string, (typeof procesos)[number]>();
  for (const p of procesos) {
    if (!porEmpresa.has(p.empresaId)) porEmpresa.set(p.empresaId, p);
  }
  res.json(
    filas.map((f) => {
      const p = porEmpresa.get(f.id);
      return {
        empresa: { id: f.id, nombre: f.nombre, nit: f.nit },
        rol: f.rol,
        proceso: p ? serializarProceso(p) : null,
      };
    })
  );
}

export const procesos = { listar, crear, obtener, actualizar, eliminar, marcarActividad, agregarNota, cartera };
