import { Request, Response } from "express";
import { z } from "zod";
import { upload } from "../lib/multer.js";
import { TipoAdjuntoEntidad, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashContenido, nombreSeguro, guardarArchivoAdjunto, eliminarArchivoAdjunto, adjuntosDir } from "../lib/adjuntos.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import path from "node:path";

export const subirAdjunto = upload.single("archivo");

const subirAdjuntoSchema = z.object({
  entidad: z.enum(["COMPROBANTE", "EMPRESA"]),
  entidadId: z.string().min(1),
});

const TAMANO_MAX = 15 * 1024 * 1024;

async function validarEntidad(entidad: string, entidadId: string, empresaId: string): Promise<boolean> {
  if (entidad === "COMPROBANTE") {
    const c = await prisma.comprobante.findFirst({ where: { id: Number(entidadId), empresaId } });
    return Boolean(c);
  }
  if (entidad === "EMPRESA") {
    if (entidadId !== empresaId) return false;
    const e = await prisma.empresa.findUnique({ where: { id: entidadId } });
    return Boolean(e);
  }
  return false;
}

export async function subir(req: Request, res: Response): Promise<void> {
  const parsed = subirAdjuntoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten().fieldErrors });
    return;
  }
  const { entidad, entidadId } = parsed.data;
  const archivo = req.file;

  if (!archivo) {
    res.status(400).json({ error: "No se recibió ningún archivo (campo 'archivo')" });
    return;
  }
  if (archivo.size > TAMANO_MAX) {
    res.status(413).json({ error: "El archivo supera el tamaño máximo de 15 MB" });
    return;
  }
  if (!(await validarEntidad(entidad, entidadId, req.empresaId!))) {
    res.status(404).json({ error: "Entidad destino no encontrada en esta empresa" });
    return;
  }

  const { nombreArchivo } = nombreSeguro(archivo.originalname);
  await guardarArchivoAdjunto(archivo.buffer, nombreArchivo);

  try {
    const adjunto = await prisma.adjunto.create({
      data: {
        empresaId: req.empresaId!,
        entidad: entidad as TipoAdjuntoEntidad,
        entidadId,
        nombreOriginal: archivo.originalname.slice(0, 255),
        nombreArchivo,
        mimeType: archivo.mimetype || "application/octet-stream",
        tamanoBytes: archivo.size,
        hash: hashContenido(archivo.buffer),
        usuarioId: req.user!.sub,
      },
    });
    await registrarAuditoria(prisma, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.SUBIR_ADJUNTO,
      entidad,
      entidadId,
      detalle: { nombre: adjunto.nombreOriginal, tamanoBytes: adjunto.tamanoBytes },
    });
    res.status(201).json(adjunto);
  } catch (err) {
    await eliminarArchivoAdjunto(nombreArchivo);
    throw err;
  }
}

export async function listar(req: Request, res: Response): Promise<void> {
  const entidad = String(req.query.entidad ?? "");
  const entidadId = String(req.query.entidadId ?? "");
  // A1: si se filtra por entidad, el valor debe ser un enum válido.
  if (entidad && !(Object.values(TipoAdjuntoEntidad) as string[]).includes(entidad)) {
    res.status(400).json({ error: `entidad inválida: ${entidad}` });
    return;
  }
  const where = { empresaId: req.empresaId!, entidad: entidad as TipoAdjuntoEntidad, entidadId };
  const adjuntos = await prisma.adjunto.findMany({
    where,
    include: { usuario: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(adjuntos.map((a) => ({ ...a, usuario: a.usuario.nombre })));
}

export async function descargar(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const id = Number(req.params.id);
  const adjunto = await prisma.adjunto.findFirst({ where: { id, empresaId } });
  if (!adjunto) {
    res.status(404).json({ error: "Adjunto no encontrado" });
    return;
  }
  await registrarAuditoria(prisma, {
    usuarioId: req.user!.sub,
    empresaId,
    accion: AccionAuditoria.DESCARGAR_ADJUNTO,
    entidad: adjunto.entidad,
    entidadId: adjunto.entidadId,
    detalle: { nombre: adjunto.nombreOriginal, tamanoBytes: adjunto.tamanoBytes },
  });
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(adjunto.nombreOriginal)}`);
  res.sendFile(path.join(adjuntosDir, adjunto.nombreArchivo));
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const adjunto = await prisma.adjunto.findFirst({ where: { id, empresaId: req.empresaId! } });
  if (!adjunto) {
    res.status(404).json({ error: "Adjunto no encontrado" });
    return;
  }
  await prisma.adjunto.delete({ where: { id } });
  await eliminarArchivoAdjunto(adjunto.nombreArchivo);
  await registrarAuditoria(prisma, {
    usuarioId: req.user!.sub,
    empresaId: req.empresaId,
    accion: AccionAuditoria.ELIMINAR_ADJUNTO,
    entidad: adjunto.entidad,
    entidadId: adjunto.entidadId,
    detalle: { nombre: adjunto.nombreOriginal },
  });
  res.json({ ok: true });
}
