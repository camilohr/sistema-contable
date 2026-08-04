import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";

const crearSchema = z.object({
  terceroId: z.string().uuid(),
  cargo: z.string().optional().nullable(),
  salarioBase: z.number().positive(),
  fechaIngreso: z.string().min(1),
  ibcAjuste: z.number().min(0).default(0),
  arlEmpleador: z.number().min(0).max(10).default(0.522),
  auxilioTransporteManual: z.boolean().default(false),
});

const actualizarSchema = z.object({
  cargo: z.string().optional().nullable(),
  salarioBase: z.number().positive().optional(),
  ibcAjuste: z.number().min(0).optional(),
  arlEmpleador: z.number().min(0).max(10).optional(),
  auxilioTransporteManual: z.boolean().optional(),
});

const retiroSchema = z.object({
  fechaRetiro: z.string().min(1),
});

function num(x: Prisma.Decimal | null | undefined): number {
  return x ? x.toNumber() : 0;
}

const TERCERO = { select: { id: true, tipoDocumento: true, documento: true, nombreRazonSocial: true, email: true, telefono: true } };
const INCLUDE = { tercero: TERCERO, _count: { select: { liquidaciones: true } } };

type EmpleadoConRel = Prisma.EmpleadoGetPayload<{ include: typeof INCLUDE }>;

function serializarEmpleado(e: EmpleadoConRel) {
  return {
    id: e.id,
    terceroId: e.terceroId,
    documento: e.tercero.documento,
    nombre: e.tercero.nombreRazonSocial,
    email: e.tercero.email,
    telefono: e.tercero.telefono,
    cargo: e.cargo,
    salarioBase: num(e.salarioBase),
    fechaIngreso: e.fechaIngreso.toISOString().slice(0, 10),
    fechaRetiro: e.fechaRetiro ? e.fechaRetiro.toISOString().slice(0, 10) : null,
    ibcAjuste: num(e.ibcAjuste),
    arlEmpleador: num(e.arlEmpleador),
    auxilioTransporteManual: e.auxilioTransporteManual,
    activo: e.activo,
    numLiquidaciones: e._count.liquidaciones,
  };
}

export async function listar(req: Request, res: Response): Promise<void> {
  const activo = req.query.activo ? String(req.query.activo) : undefined;
  const where: Prisma.EmpleadoWhereInput = {};
  if (activo === "true") where.activo = true;
  if (activo === "false") where.activo = false;
  const empleados = await prisma.empleado.findMany({
    where,
    orderBy: [{ activo: "desc" }, { createdAt: "asc" }],
    include: INCLUDE,
  });
  res.json(empleados.map((e) => serializarEmpleado(e)));
}

export async function crear(req: Request, res: Response): Promise<void> {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const fecha = new Date(data.fechaIngreso);
  if (isNaN(fecha.getTime())) {
    res.status(400).json({ error: "Fecha de ingreso inválida" });
    return;
  }
  const tercero = await prisma.tercero.findUnique({ where: { id: data.terceroId } });
  if (!tercero) {
    res.status(400).json({ error: "El tercero no existe" });
    return;
  }
  if (tercero.tipoDocumento !== "CC") {
    res.status(400).json({ error: "El tercero debe tener tipo de documento CC para registrarse como empleado" });
    return;
  }
  const yaRegistrado = await prisma.empleado.findUnique({ where: { terceroId: data.terceroId } });
  if (yaRegistrado) {
    res.status(400).json({ error: "El tercero ya está registrado como empleado" });
    return;
  }

  const empleado = await prisma.$transaction(async (tx) => {
    const e = await tx.empleado.create({
      data: {
        terceroId: data.terceroId,
        cargo: data.cargo ?? null,
        salarioBase: new Prisma.Decimal(data.salarioBase),
        fechaIngreso: fecha,
        ibcAjuste: new Prisma.Decimal(data.ibcAjuste),
        arlEmpleador: new Prisma.Decimal(data.arlEmpleador),
        auxilioTransporteManual: data.auxilioTransporteManual,
      },
      include: INCLUDE,
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      accion: AccionAuditoria.CREAR_EMPLEADO,
      entidad: "Empleado",
      entidadId: e.id,
      detalle: { nombre: e.tercero.nombreRazonSocial, documento: e.tercero.documento, salarioBase: data.salarioBase },
    });
    return e;
  });
  res.status(201).json(serializarEmpleado(empleado));
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const existe = await prisma.empleado.findUnique({ where: { id } });
  if (!existe) {
    res.status(404).json({ error: "Empleado no encontrado" });
    return;
  }
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const empleado = await prisma.$transaction(async (tx) => {
    const e = await tx.empleado.update({
      where: { id },
      data: {
        cargo: data.cargo !== undefined ? data.cargo : undefined,
        salarioBase: data.salarioBase !== undefined ? new Prisma.Decimal(data.salarioBase) : undefined,
        ibcAjuste: data.ibcAjuste !== undefined ? new Prisma.Decimal(data.ibcAjuste) : undefined,
        arlEmpleador: data.arlEmpleador !== undefined ? new Prisma.Decimal(data.arlEmpleador) : undefined,
        auxilioTransporteManual: data.auxilioTransporteManual !== undefined ? data.auxilioTransporteManual : undefined,
      },
      include: INCLUDE,
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      accion: AccionAuditoria.EDITAR_EMPLEADO,
      entidad: "Empleado",
      entidadId: id,
      detalle: { salarioBase: data.salarioBase, cargo: data.cargo },
    });
    return e;
  });
  res.json(serializarEmpleado(empleado));
}

export async function retirar(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const empleado = await prisma.empleado.findUnique({ where: { id } });
  if (!empleado) {
    res.status(404).json({ error: "Empleado no encontrado" });
    return;
  }
  if (!empleado.activo) {
    res.status(400).json({ error: "El empleado ya está retirado" });
    return;
  }
  const parsed = retiroSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const fecha = new Date(parsed.data.fechaRetiro);
  if (isNaN(fecha.getTime())) {
    res.status(400).json({ error: "Fecha de retiro inválida" });
    return;
  }
  const actualizado = await prisma.$transaction(async (tx) => {
    const e = await tx.empleado.update({
      where: { id },
      data: { fechaRetiro: fecha, activo: false },
      include: INCLUDE,
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      accion: AccionAuditoria.RETIRAR_EMPLEADO,
      entidad: "Empleado",
      entidadId: id,
      detalle: { fechaRetiro: parsed.data.fechaRetiro },
    });
    return e;
  });
  res.json(serializarEmpleado(actualizado));
}

export async function listarLiquidaciones(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const empleado = await prisma.empleado.findUnique({ where: { id } });
  if (!empleado) {
    res.status(404).json({ error: "Empleado no encontrado" });
    return;
  }
  const liquidaciones = await prisma.nomina.findMany({
    where: { empleadoId: id },
    orderBy: { createdAt: "asc" },
    include: { periodo: { select: { nombre: true, estado: true } } },
  });
  res.json(
    liquidaciones.map((n) => ({
      id: n.id,
      periodoId: n.periodoId,
      periodo: n.periodo.nombre,
      estado: n.estado,
      comprobanteId: n.comprobanteId,
      sueldo: num(n.sueldo),
      totalDevengado: num(n.totalDevengado),
      totalDeducciones: num(n.totalDeducciones),
      netoPagar: num(n.netoPagar),
    }))
  );
}

export const empleados = { listar, crear, actualizar, retirar, listarLiquidaciones };
