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

const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
});

export async function cambiarPassword(req: Request, res: Response): Promise<void> {
  const parsed = cambiarPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: req.user!.sub } });
  if (!usuario) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.passwordActual, usuario.passwordHash);
  if (!ok) {
    res.status(400).json({ error: "La contraseña actual es incorrecta" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.passwordNueva, 10);
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { passwordHash },
  });
  res.json({ ok: true });
}
