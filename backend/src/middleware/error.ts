import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { randomUUID } from "node:crypto";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "Ruta no encontrada" });
}

export function errorHandler(err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta?.target as string[])?.join(", ") ?? "registro";
    res.status(409).json({ error: `Ya existe un registro con ese valor (${target})` });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "El archivo supera el tamaño máximo permitido (15 MB)" });
      return;
    }
    res.status(400).json({ error: `Error al procesar el archivo: ${err.message}` });
    return;
  }
  if (err.message?.startsWith("Tipo de archivo no permitido")) {
    res.status(400).json({ error: err.message });
    return;
  }
  // Errores 4xx explícitos lanzados por la aplicación: se exponen tal cual.
  if (err.status && err.status < 500) {
    res.status(err.status).json({ error: err.message ?? "Solicitud inválida" });
    return;
  }
  // M3: nunca filtrar detalles internos en un 500; responder con código correlativo
  // que quede en el log para poder rastrear la causa.
  const errorId = randomUUID();
  console.error(`[error:${errorId}]`, err);
  res.status(500).json({ error: "Error interno del servidor", errorId });
}
