import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const createSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  rol: z.enum(["ADMIN", "CONTADOR", "AUXILIAR"]),
});

export async function listar(_req: Request, res: Response): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, email: true, rol: true, activo: true, debeCambiarPassword: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(usuarios);
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
  const usuario = await prisma.usuario.create({
    data: { nombre, email: email.toLowerCase(), passwordHash, rol, debeCambiarPassword: true },
    select: { id: true, nombre: true, email: true, rol: true, activo: true, debeCambiarPassword: true },
  });
  res.status(201).json(usuario);
}
