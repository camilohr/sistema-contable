import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { AccionAuditoria } from "@prisma/client";

const createSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  rol: z.enum(["ADMIN", "CONTADOR", "AUXILIAR"]),
});

export async function listar(req: Request, res: Response): Promise<void> {
  const vinculos = await prisma.usuarioEmpresa.findMany({
    where: { empresaId: req.empresaId },
    orderBy: { createdAt: "asc" },
    include: { usuario: { select: { id: true, nombre: true, email: true, activo: true, debeCambiarPassword: true, createdAt: true } } },
  });
  res.json(
    vinculos.map((v) => ({
      id: v.usuario.id,
      nombre: v.usuario.nombre,
      email: v.usuario.email,
      rol: v.rol,
      activo: v.usuario.activo,
      debeCambiarPassword: v.usuario.debeCambiarPassword,
      createdAt: v.usuario.createdAt,
    }))
  );
}

export async function crear(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const { nombre, email, password, rol } = parsed.data;
  const existente = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
  if (existente) {
    res.status(409).json({ error: "El correo ya está registrado" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const usuario = await prisma.$transaction(async (tx) => {
    const u = await tx.usuario.create({
      data: { nombre, email: email.toLowerCase(), passwordHash, rol, debeCambiarPassword: true },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, debeCambiarPassword: true },
    });
    await tx.usuarioEmpresa.create({
      data: { usuarioId: u.id, empresaId: req.empresaId!, rol },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.CREAR_USUARIO,
      entidad: "Usuario",
      entidadId: u.id,
      detalle: { email: u.email, rol: u.rol },
    });
    return u;
  });
  res.status(201).json(usuario);
}
