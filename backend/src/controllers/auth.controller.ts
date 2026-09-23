import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { redondeosBcrypt, hashDummy } from "../lib/seguridad.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { AccionAuditoria } from "@prisma/client";

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
  const ip = req.ip ?? "desconocida";
  const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
  // B2: comparación incluso cuando el usuario no existe (hash ficticio),
  // para no revelar por tiempo de respuesta si un correo está registrado.
  const credencialesValidas = usuario
    ? await bcrypt.compare(password, usuario.passwordHash)
    : await bcrypt.compare(password, hashDummy());
  if (!usuario || !usuario.activo || !credencialesValidas) {
    if (usuario) {
      await registrarAuditoria(prisma, {
        usuarioId: usuario.id,
        accion: AccionAuditoria.LOGIN_FALLIDO,
        entidad: "Usuario",
        entidadId: usuario.id,
        detalle: { ip, ruta: req.originalUrl },
      }).catch(() => undefined);
    }
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  const token = signToken({
    sub: usuario.id,
    rol: usuario.rol,
    nombre: usuario.nombre,
    tokenVersion: usuario.tokenVersion,
  });
  await registrarAuditoria(prisma, {
    usuarioId: usuario.id,
    accion: AccionAuditoria.LOGIN_OK,
    entidad: "Usuario",
    entidadId: usuario.id,
    detalle: { ip },
  }).catch(() => undefined);
  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      debeCambiarPassword: usuario.debeCambiarPassword,
    },
  });
}

export async function me(req: Request, res: Response): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.user!.sub },
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      activo: true,
      debeCambiarPassword: true,
      usuarioEmpresas: { include: { empresa: { select: { id: true, nombre: true, nit: true, activa: true } } } },
    },
  });
  if (!usuario) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const { usuarioEmpresas, ...resto } = usuario;
  res.json({
    ...resto,
    empresas: usuarioEmpresas
      .filter((e) => e.empresa.activa)
      .map((e) => ({ id: e.empresa.id, nombre: e.empresa.nombre, nit: e.empresa.nit, rol: e.rol })),
  });
}

const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z
    .string()
    .min(8, "La nueva contraseña debe tener al menos 8 caracteres")
    .regex(/[a-zA-Z]/, "La nueva contraseña debe contener letras")
    .regex(/[0-9]/, "La nueva contraseña debe contener al menos un número"),
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
  const passwordHash = await bcrypt.hash(parsed.data.passwordNueva, redondeosBcrypt());
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuario.id },
      // M1: invalidar todos los tokens emitidos con la contraseña anterior.
      data: { passwordHash, debeCambiarPassword: false, tokenVersion: { increment: 1 } },
    });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      accion: AccionAuditoria.CAMBIAR_PASSWORD,
      entidad: "Usuario",
      entidadId: usuario.id,
      detalle: { ip: req.ip ?? "desconocida" },
    });
  });
  res.json({ ok: true });
}
