import { Request, Response } from "express";
import { Prisma, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function listar(req: Request, res: Response): Promise<void> {
  const usuarioId = req.query.usuarioId ? String(req.query.usuarioId) : undefined;
  const entidad = req.query.entidad ? String(req.query.entidad) : undefined;
  const accion = req.query.accion ? String(req.query.accion) : undefined;
  const desdeStr = req.query.desde ? String(req.query.desde) : undefined;
  const hastaStr = req.query.hasta ? String(req.query.hasta) : undefined;
  const limite = Math.min(Number(req.query.limite) || 100, 500);
  const antesDeId = req.query.antesDeId ? Number(req.query.antesDeId) : undefined;

  const where: Prisma.AuditoriaWhereInput = {};
  if (usuarioId) where.usuarioId = usuarioId;
  if (entidad) where.entidad = entidad;
  if (accion && (Object.values(AccionAuditoria) as string[]).includes(accion)) {
    where.accion = accion as AccionAuditoria;
  }
  if (desdeStr || hastaStr) {
    const filtro: Prisma.DateTimeFilter = {};
    const desde = new Date(desdeStr ?? "");
    const hasta = new Date(hastaStr ?? "");
    if (desdeStr && !isNaN(desde.getTime())) filtro.gte = desde;
    if (hastaStr && !isNaN(hasta.getTime())) filtro.lte = hasta;
    where.fecha = filtro;
  }
  if (antesDeId) where.id = { lt: antesDeId };

  const registros = await prisma.auditoria.findMany({
    where,
    orderBy: { id: "desc" },
    take: limite,
    include: { usuario: { select: { nombre: true, email: true } } },
  });

  res.json(
    registros.map((r) => ({
      id: r.id,
      usuarioId: r.usuarioId,
      usuario: r.usuario.nombre,
      accion: r.accion,
      entidad: r.entidad,
      entidadId: r.entidadId,
      detalle: r.detalle,
      fecha: r.fecha,
    }))
  );
}
