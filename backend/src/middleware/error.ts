import { Request, Response, NextFunction } from "express";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "Ruta no encontrada" });
}

export function errorHandler(err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Error interno del servidor" });
}
