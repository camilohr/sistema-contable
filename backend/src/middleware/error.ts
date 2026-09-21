import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";

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
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Error interno del servidor" });
}
