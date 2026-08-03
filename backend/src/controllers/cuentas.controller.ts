import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { derivarPuc } from "../lib/puc.js";

const CODIGO_PATTERN = /^(?:\d{1}|\d{2}|\d{4}|\d{6}|\d{8})$/;

const crearSchema = z.object({
  codigo: z.string().regex(CODIGO_PATTERN, "Código inválido (longitud 1, 2, 4, 6 u 8)"),
  nombre: z.string().min(1),
  requiereTercero: z.boolean().optional(),
});

const actualizarSchema = z.object({
  nombre: z.string().min(1).optional(),
  activa: z.boolean().optional(),
  requiereTercero: z.boolean().optional(),
});

export async function listar(req: Request, res: Response): Promise<void> {
  const clase = req.query.clase ? Number(req.query.clase) : undefined;
  const nivel = req.query.nivel ? Number(req.query.nivel) : undefined;
  const busqueda = req.query.busqueda ? String(req.query.busqueda).trim() : undefined;
  const soloMovimiento = req.query.soloMovimiento === "true";

  const where: Record<string, unknown> = {};
  if (clase) where.clase = clase;
  if (nivel) where.nivel = nivel;
  if (soloMovimiento) where.permiteMovimiento = true;
  if (busqueda) {
    where.OR = [
      { codigo: { startsWith: busqueda } },
      { nombre: { contains: busqueda, mode: "insensitive" } },
    ];
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
  const { codigo, nombre, requiereTercero } = parsed.data;

  const existe = await prisma.cuenta.findUnique({ where: { codigo } });
  if (existe) {
    res.status(409).json({ error: `La cuenta ${codigo} ya existe` });
    return;
  }

  if (codigo.length > 1) {
    const codigoPadre = codigo.slice(0, codigo.length <= 2 ? 1 : codigo.length - 2);
    const padre = await prisma.cuenta.findUnique({ where: { codigo: codigoPadre } });
    if (!padre) {
      res.status(400).json({ error: `No existe la cuenta padre ${codigoPadre}` });
      return;
    }
  }

  const cuenta = await prisma.cuenta.create({
    data: {
      codigo,
      nombre,
      requiereTercero: requiereTercero ?? false,
      permiteMovimiento: false,
      ...derivarPuc(codigo),
    },
  });
  res.status(201).json(cuenta);
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const cuenta = await prisma.cuenta.update({
    where: { id },
    data: parsed.data,
  });
  res.json(cuenta);
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cuenta = await prisma.cuenta.findUnique({ where: { id } });
  if (!cuenta) {
    res.status(404).json({ error: "Cuenta no encontrada" });
    return;
  }

  const hijas = await prisma.cuenta.count({
    where: { codigo: { startsWith: cuenta.codigo, not: cuenta.codigo } },
  });
  if (hijas > 0) {
    res.status(400).json({ error: "No se puede eliminar: la cuenta tiene subcuentas." });
    return;
  }

  await prisma.cuenta.delete({ where: { id } });
  res.json({ ok: true });
}
