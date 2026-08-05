import { Request, Response } from "express";
import { z } from "zod";
import { AccionAuditoria, TipoDocumentoCliente } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { rolMasRestrictivo } from "../middleware/auth.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { crearProcesoConPlantilla } from "../lib/procesos.js";

const crearSchema = z.object({
  nombre: z.string().min(1),
  nit: z.string().min(1),
  tipoDocumento: z.nativeEnum(TipoDocumentoCliente).optional(),
  direccion: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  moneda: z.string().optional(),
  anioFiscalInicio: z.number().int().min(1).max(12).optional(),
  mensajeRecibo: z.string().nullable().optional(),
});

const actualizarSchema = z
  .object({
    nombre: z.string().min(1).optional(),
    nit: z.string().min(1).optional(),
    tipoDocumento: z.nativeEnum(TipoDocumentoCliente).optional(),
    direccion: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    moneda: z.string().optional(),
    anioFiscalInicio: z.number().int().min(1).max(12).optional(),
    mensajeRecibo: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Debe indicar al menos un campo" });

const estadoSchema = z.object({ activa: z.boolean() });

export async function listar(req: Request, res: Response): Promise<void> {
  const rolGlobal = req.user!.rol;
  if (rolGlobal === "ADMIN") {
    const todas = await prisma.empresa.findMany({
      where: { activa: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, nit: true },
    });
    res.json(todas.map((e) => ({ id: e.id, nombre: e.nombre, nit: e.nit, rol: "ADMIN" })));
    return;
  }
  const vinculos = await prisma.usuarioEmpresa.findMany({
    where: { usuarioId: req.user!.sub, activo: true, empresa: { activa: true } },
    orderBy: { createdAt: "asc" },
    include: { empresa: { select: { id: true, nombre: true, nit: true } } },
  });
  res.json(
    vinculos.map((v) => ({
      id: v.empresa.id,
      nombre: v.empresa.nombre,
      nit: v.empresa.nit,
      rol: rolMasRestrictivo(rolGlobal, v.rol),
    }))
  );
}

export async function administracion(req: Request, res: Response): Promise<void> {
  const empresas = await prisma.empresa.findMany({
    orderBy: [{ activa: "desc" }, { nombre: "asc" }],
    include: {
      _count: { select: { usuariosEmpresa: true, periodos: true, procesosContables: true, adjuntos: true } },
    },
  });
  res.json(
    empresas.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      nit: e.nit,
      tipoDocumento: e.tipoDocumento,
      direccion: e.direccion,
      telefono: e.telefono,
      moneda: e.moneda,
      anioFiscalInicio: e.anioFiscalInicio,
      mensajeRecibo: e.mensajeRecibo,
      activa: e.activa,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      conteos: {
        usuarios: e._count.usuariosEmpresa,
        periodos: e._count.periodos,
        procesos: e._count.procesosContables,
        adjuntos: e._count.adjuntos,
      },
    }))
  );
}

export async function crear(req: Request, res: Response): Promise<void> {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const { nombre, nit, tipoDocumento, direccion, telefono, moneda, anioFiscalInicio, mensajeRecibo } = parsed.data;
  const empresa = await prisma.$transaction(async (tx) => {
    const e = await tx.empresa.create({
      data: {
        nombre,
        nit,
        tipoDocumento: tipoDocumento ?? "NIT",
        direccion: direccion ?? null,
        telefono: telefono ?? null,
        moneda: moneda ?? "COP",
        anioFiscalInicio: anioFiscalInicio ?? 1,
        mensajeRecibo: mensajeRecibo ?? null,
      },
      select: { id: true, nombre: true, nit: true, anioFiscalInicio: true },
    });
    await crearProcesoConPlantilla(tx, e.id, new Date().getFullYear());
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: e.id,
      accion: AccionAuditoria.CREAR_EMPRESA,
      entidad: "Empresa",
      entidadId: e.id,
      detalle: { nombre: e.nombre, nit: e.nit },
    });
    return e;
  });
  res.status(201).json(empresa);
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const existe = await prisma.empresa.findUnique({ where: { id: req.params.id } });
  if (!existe) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  const empresa = await prisma.$transaction(async (tx) => {
    const e = await tx.empresa.update({ where: { id: existe.id }, data: parsed.data });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: existe.id,
      accion: AccionAuditoria.EDITAR_EMPRESA,
      entidad: "Empresa",
      entidadId: existe.id,
      detalle: { nombre: e.nombre, cambios: parsed.data },
    });
    return e;
  });
  res.json({ id: empresa.id, nombre: empresa.nombre, nit: empresa.nit, activa: empresa.activa });
}

export async function cambiarEstado(req: Request, res: Response): Promise<void> {
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const existe = await prisma.empresa.findUnique({ where: { id: req.params.id } });
  if (!existe) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  if (parsed.data.activa === existe.activa) {
    res.status(400).json({ error: `La empresa ya está ${parsed.data.activa ? "activa" : "inactiva"}` });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.empresa.update({ where: { id: existe.id }, data: { activa: parsed.data.activa } });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: existe.id,
      accion: parsed.data.activa ? AccionAuditoria.ACTIVAR_EMPRESA : AccionAuditoria.DESACTIVAR_EMPRESA,
      entidad: "Empresa",
      entidadId: existe.id,
      detalle: { nombre: existe.nombre, activa: parsed.data.activa },
    });
  });
  res.json({ id: existe.id, activa: parsed.data.activa });
}

export const empresas = { listar, administracion, crear, actualizar, cambiarEstado };
