import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { derivarPuc } from "../lib/puc.js";
import { registrarAuditoria } from "../lib/auditoria.js";

const CODIGO_PATTERN = /^(?:\d{1}|\d{2}|\d{4}|\d{6}|\d{8})$/;

const crearSchema = z.object({
  codigo: z.string().regex(CODIGO_PATTERN, "Código inválido (longitud 1, 2, 4, 6 u 8)"),
  nombre: z.string().min(1),
  requiereTercero: z.boolean().optional(),
  permiteMovimiento: z.boolean().optional(),
});

const actualizarSchema = z.object({
  nombre: z.string().min(1).optional(),
  activa: z.boolean().optional(),
  requiereTercero: z.boolean().optional(),
  permiteMovimiento: z.boolean().optional(),
});

export async function listar(req: Request, res: Response): Promise<void> {
  const clase = req.query.clase ? Number(req.query.clase) : undefined;
  const nivel = req.query.nivel ? Number(req.query.nivel) : undefined;
  const busqueda = req.query.busqueda ? String(req.query.busqueda).trim() : undefined;
  const soloMovimiento = req.query.soloMovimiento === "true";

  const where: Record<string, unknown> = { AND: [{ OR: [{ empresaId: null }, { empresaId: req.empresaId }] }] };
  if (clase) where.clase = clase;
  if (nivel) where.nivel = nivel;
  if (soloMovimiento) where.permiteMovimiento = true;
  if (busqueda) {
    (where.AND as unknown[]).push({
      OR: [
        { codigo: { startsWith: busqueda } },
        { nombre: { contains: busqueda, mode: "insensitive" } },
      ],
    });
  }

  const cuentas = await prisma.cuenta.findMany({
    where,
    orderBy: { codigo: "asc" },
  });

  const codigos = cuentas.map((c) => c.codigo);
  const conHijas = (codigo: string) =>
    codigos.some((c) => c.length > codigo.length && c.startsWith(codigo));

  res.json(
    cuentas.map((c) => ({
      ...c,
      tieneHijas: conHijas(c.codigo),
    }))
  );
}

export async function crear(req: Request, res: Response): Promise<void> {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const { codigo, nombre, requiereTercero, permiteMovimiento } = parsed.data;

  const existe = await prisma.cuenta.findFirst({
    where: { OR: [{ empresaId: null }, { empresaId: req.empresaId }], codigo },
  });
  if (existe) {
    res.status(409).json({ error: `La cuenta ${codigo} ya existe` });
    return;
  }

  if (codigo.length > 1) {
    const codigoPadre = codigo.slice(0, codigo.length <= 2 ? 1 : codigo.length - 2);
    const padre = await prisma.cuenta.findFirst({
      where: { OR: [{ empresaId: null }, { empresaId: req.empresaId }], codigo: codigoPadre },
    });
    if (!padre) {
      res.status(400).json({ error: `No existe la cuenta padre ${codigoPadre}` });
      return;
    }
    if (padre.permiteMovimiento) {
      res.status(400).json({ error: `La cuenta ${codigoPadre} permite movimiento y no puede tener subcuentas.` });
      return;
    }
  }

  try {
    const cuenta = await prisma.$transaction(async (tx) => {
      const c = await tx.cuenta.create({
        data: {
          empresaId: req.empresaId,
          codigo,
          nombre,
          requiereTercero: requiereTercero ?? false,
          permiteMovimiento: permiteMovimiento ?? false,
          ...derivarPuc(codigo),
        },
      });
      await registrarAuditoria(tx, {
        usuarioId: req.user!.sub,
        empresaId: req.empresaId,
        accion: AccionAuditoria.CREAR_CUENTA,
        entidad: "Cuenta",
        entidadId: c.id,
        detalle: { codigo: c.codigo, nombre: c.nombre },
      });
      return c;
    });
    res.status(201).json(cuenta);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      res.status(409).json({ error: `La cuenta ${codigo} ya existe` });
      return;
    }
    throw e;
  }
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const existe = await prisma.cuenta.findFirst({
    where: { id, OR: [{ empresaId: req.empresaId }, { empresaId: null }] },
  });
  if (!existe) {
    res.status(404).json({ error: "Cuenta no encontrada" });
    return;
  }
  if (parsed.data.permiteMovimiento === true) {
    const conHijas = await prisma.cuenta.count({
      where: {
        OR: [{ empresaId: null }, { empresaId: req.empresaId }],
        codigo: { startsWith: existe.codigo, not: existe.codigo },
      },
    });
    if (conHijas > 0) {
      res.status(400).json({ error: "No se puede permitir movimiento: la cuenta tiene subcuentas." });
      return;
    }
  }
  const cuenta = await prisma.$transaction(async (tx) => {
    const c = await tx.cuenta.update({
      where: { id },
      data: parsed.data,
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.EDITAR_CUENTA,
      entidad: "Cuenta",
      entidadId: id,
      detalle: { codigo: c.codigo, nombre: c.nombre, cambios: parsed.data },
    });
    return c;
  });
  res.json(cuenta);
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cuenta = await prisma.cuenta.findFirst({
    where: { id, OR: [{ empresaId: req.empresaId }, { empresaId: null }] },
  });
  if (!cuenta) {
    res.status(404).json({ error: "Cuenta no encontrada" });
    return;
  }
  if (cuenta.empresaId === null) {
    res.status(403).json({ error: "No se puede eliminar una cuenta del PUC nacional (compartida)." });
    return;
  }

  const hijas = await prisma.cuenta.count({
    where: { codigo: { startsWith: cuenta.codigo, not: cuenta.codigo }, empresaId: req.empresaId },
  });
  if (hijas > 0) {
    res.status(400).json({ error: "No se puede eliminar: la cuenta tiene subcuentas." });
    return;
  }

  const conRefs = await prisma.cuenta.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          asientos: true,
          activosActivo: true,
          activosDepreciacion: true,
          activosGasto: true,
          cierresAnuales: true,
          parametrosCuentaNomina: true,
          presupuestos: true,
          conciliaciones: true,
        },
      },
    },
  });
  const refs = conRefs?._count;
  if (refs && (refs.asientos + refs.activosActivo + refs.activosDepreciacion + refs.activosGasto + refs.cierresAnuales + refs.parametrosCuentaNomina + refs.presupuestos + refs.conciliaciones) > 0) {
    const motivo: string[] = [];
    if (refs.asientos > 0) motivo.push(`${refs.asientos} asiento(s)`);
    if (refs.activosActivo + refs.activosDepreciacion + refs.activosGasto > 0) motivo.push("activos fijos referenciados");
    if (refs.cierresAnuales > 0) motivo.push(`${refs.cierresAnuales} cierre(s) anual(es)`);
    if (refs.parametrosCuentaNomina > 0) motivo.push("parámetros de nómina");
    if (refs.presupuestos > 0) motivo.push(`${refs.presupuestos} presupuesto(s)`);
    if (refs.conciliaciones > 0) motivo.push(`${refs.conciliaciones} conciliación(es)`);
    res.status(400).json({ error: `No se puede eliminar: la cuenta está referenciada (${motivo.join(", ")}).` });
    return;
  }

  try {
    await prisma.cuenta.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      res.status(400).json({ error: "No se puede eliminar: la cuenta está referenciada." });
      return;
    }
    throw e;
  }
}
