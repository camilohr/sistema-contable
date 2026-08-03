import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
  if (!usuario || !usuario.activo) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  const ok = await bcrypt.compare(password, usuario.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  const token = signToken({ sub: usuario.id, rol: usuario.rol, nombre: usuario.nombre });
  res.json({
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
  });
}

export async function me(req: Request, res: Response): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, nombre: true, email: true, rol: true, activo: true },
  });
  if (!usuario) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  res.json(usuario);
}
