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

const rolSchema = z.object({
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

export async function disponibles(req: Request, res: Response): Promise<void> {
  const vinculados = await prisma.usuarioEmpresa.findMany({
    where: { empresaId: req.empresaId },
    select: { usuarioId: true },
  });
  const usuarios = await prisma.usuario.findMany({
    where: { id: { notIn: vinculados.map((v) => v.usuarioId) } },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, email: true, rol: true, activo: true },
  });
  res.json(
    usuarios.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      activo: u.activo,
    }))
  );
}

export async function vincular(req: Request, res: Response): Promise<void> {
  const parsed = rolSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!usuario) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const vinculo = await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: req.empresaId! } },
    update: { rol: parsed.data.rol, activo: true },
    create: { usuarioId: usuario.id, empresaId: req.empresaId!, rol: parsed.data.rol },
  });
  await registrarAuditoria(prisma, {
    usuarioId: req.user!.sub,
    empresaId: req.empresaId,
    accion: AccionAuditoria.ASIGNAR_USUARIO_EMPRESA,
    entidad: "Usuario",
    entidadId: usuario.id,
    detalle: { email: usuario.email, rol: parsed.data.rol },
  });
  res.status(201).json({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: vinculo.rol });
}

export async function cambiarRol(req: Request, res: Response): Promise<void> {
  const parsed = rolSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const vinculo = await prisma.usuarioEmpresa.findUnique({
    where: { usuarioId_empresaId: { usuarioId: req.params.id, empresaId: req.empresaId! } },
    include: { usuario: { select: { nombre: true, email: true } } },
  });
  if (!vinculo) {
    res.status(404).json({ error: "El usuario no está asignado a esta empresa" });
    return;
  }
  const actualizado = await prisma.usuarioEmpresa.update({
    where: { usuarioId_empresaId: { usuarioId: req.params.id, empresaId: req.empresaId! } },
    data: { rol: parsed.data.rol },
  });
  await registrarAuditoria(prisma, {
    usuarioId: req.user!.sub,
    empresaId: req.empresaId,
    accion: AccionAuditoria.CAMBIAR_ROL_EMPRESA,
    entidad: "Usuario",
    entidadId: req.params.id,
    detalle: { email: vinculo.usuario.email, rolAnterior: vinculo.rol, rolNuevo: parsed.data.rol },
  });
  res.json({ id: req.params.id, nombre: vinculo.usuario.nombre, email: vinculo.usuario.email, rol: actualizado.rol });
}

export async function retirar(req: Request, res: Response): Promise<void> {
  if (req.params.id === req.user!.sub) {
    res.status(400).json({ error: "No puede retirarse a sí mismo de la empresa activa" });
    return;
  }
  const vinculo = await prisma.usuarioEmpresa.findUnique({
    where: { usuarioId_empresaId: { usuarioId: req.params.id, empresaId: req.empresaId! } },
    include: { usuario: { select: { nombre: true, email: true } } },
  });
  if (!vinculo) {
    res.status(404).json({ error: "El usuario no está asignado a esta empresa" });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.usuarioEmpresa.delete({
      where: { usuarioId_empresaId: { usuarioId: req.params.id, empresaId: req.empresaId! } },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.RETIRAR_USUARIO_EMPRESA,
      entidad: "Usuario",
      entidadId: req.params.id,
      detalle: { email: vinculo.usuario.email, rol: vinculo.rol },
    });
  });
  res.json({ ok: true });
}
