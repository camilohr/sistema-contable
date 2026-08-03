import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "Ruta no encontrada" });
}

export function errorHandler(err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta?.target as string[])?.join(", ") ?? "registro";
    res.status(409).json({ error: `Ya existe un registro con ese valor (${target})` });
    return;
  }
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Error interno del servidor" });
}
