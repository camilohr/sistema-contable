import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function listar(req: Request, res: Response): Promise<void> {
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
      rol: v.rol,
    }))
  );
}

export const empresas = { listar };
