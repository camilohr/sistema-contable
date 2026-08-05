import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { TipoMovimientoInventario } from "@prisma/client";

const crearSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  categoria: z.string().optional().nullable(),
  unidad: z.string().min(1).optional(),
});

const actualizarSchema = z.object({
  nombre: z.string().min(1).optional(),
  categoria: z.string().optional().nullable(),
  unidad: z.string().min(1).optional(),
  activo: z.boolean().optional(),
});

const movimientoSchema = z.object({
  tipo: z.nativeEnum(TipoMovimientoInventario),
  cantidad: z.number().positive(),
  costoUnitario: z.number().nonnegative(),
  fecha: z.string().min(1),
  comprobanteId: z.number().int().positive().optional().nullable(),
});

const num = (v: { toNumber(): number } | number): number => (typeof v === "number" ? v : v.toNumber());

const serializarProducto = (p: any) => ({ ...p, costoPromedio: num(p.costoPromedio), cantidadActual: num(p.cantidadActual) });

const serializarMovimiento = (m: any) => ({ ...m, cantidad: num(m.cantidad), costoUnitario: num(m.costoUnitario) });

export async function listarProductos(req: Request, res: Response): Promise<void> {
  const busqueda = req.query.busqueda ? String(req.query.busqueda).trim() : undefined;
  const soloActivos = req.query.soloActivos === "true";

  const where: Record<string, unknown> = { empresaId: req.empresaId };
  if (soloActivos) where.activo = true;
  if (busqueda) {
    where.OR = [
      { codigo: { contains: busqueda, mode: "insensitive" } },
      { nombre: { contains: busqueda, mode: "insensitive" } },
      { categoria: { contains: busqueda, mode: "insensitive" } },
    ];
  }

  const productos = await prisma.producto.findMany({
    where,
    orderBy: { nombre: "asc" },
    include: { _count: { select: { movimientos: true } } },
  });
  res.json(productos.map(serializarProducto));
}

export async function crearProducto(req: Request, res: Response): Promise<void> {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  const duplicado = await prisma.producto.findFirst({ where: { codigo: data.codigo, empresaId: req.empresaId } });
  if (duplicado) {
    res.status(409).json({ error: `Ya existe un producto con el código ${data.codigo}` });
    return;
  }

  const producto = await prisma.producto.create({
    data: {
      empresaId: req.empresaId,
      codigo: data.codigo,
      nombre: data.nombre,
      categoria: data.categoria ?? null,
      unidad: data.unidad ?? "und",
    },
  });
  res.status(201).json(serializarProducto(producto));
}

export async function actualizarProducto(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }

  const existe = await prisma.producto.findFirst({ where: { id, empresaId: req.empresaId } });
  if (!existe) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  const producto = await prisma.producto.update({ where: { id }, data: parsed.data });
  res.json(serializarProducto(producto));
}

export async function eliminarProducto(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existe = await prisma.producto.findFirst({
    where: { id, empresaId: req.empresaId },
    include: { _count: { select: { movimientos: true } } },
  });
  if (!existe) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  if (existe._count.movimientos > 0) {
    await prisma.producto.update({ where: { id }, data: { activo: false } });
    res.json({ ok: true, desactivado: true });
    return;
  }
  await prisma.producto.delete({ where: { id } });
  res.json({ ok: true, desactivado: false });
}

export async function listarMovimientos(req: Request, res: Response): Promise<void> {
  const productoId = Number(req.params.id);
  const producto = await prisma.producto.findFirst({ where: { id: productoId, empresaId: req.empresaId } });
  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  const movimientos = await prisma.inventarioMovimiento.findMany({
    where: { productoId },
    include: { comprobante: { select: { id: true, tipo: true, consecutivo: true, concepto: true } } },
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
  });
  res.json({ producto: serializarProducto(producto), movimientos: movimientos.map(serializarMovimiento) });
}

export async function crearMovimiento(req: Request, res: Response): Promise<void> {
  const productoId = Number(req.params.id);
  const parsed = movimientoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  const producto = await prisma.producto.findFirst({ where: { id: productoId, empresaId: req.empresaId } });
  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  if (data.comprobanteId) {
    const comprobante = await prisma.comprobante.findFirst({
      where: { id: data.comprobanteId, empresaId: req.empresaId },
    });
    if (!comprobante) {
      res.status(400).json({ error: `No existe el comprobante ${data.comprobanteId}` });
      return;
    }
  }

  const cantidadActual = producto.cantidadActual.toNumber();
  const costoPromedio = producto.costoPromedio.toNumber();

  let nuevaCantidad: number;
  let costoUnitario = data.costoUnitario;

  if (data.tipo === "ENTRADA") {
    nuevaCantidad = cantidadActual + data.cantidad;
    costoUnitario = cantidadActual + data.cantidad > 0 ? (costoPromedio * cantidadActual + data.costoUnitario * data.cantidad) / (cantidadActual + data.cantidad) : data.costoUnitario;
  } else {
    if (data.cantidad > cantidadActual) {
      res.status(400).json({ error: `Saldo insuficiente: hay ${cantidadActual} ${producto.unidad}` });
      return;
    }
    nuevaCantidad = cantidadActual - data.cantidad;
    costoUnitario = costoPromedio;
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const movimiento = await tx.inventarioMovimiento.create({
      data: {
        productoId,
        comprobanteId: data.comprobanteId ?? null,
        tipo: data.tipo,
        cantidad: data.cantidad,
        costoUnitario,
        fecha: new Date(data.fecha),
      },
    });
    const actualizado = await tx.producto.update({
      where: { id: productoId },
      data: { cantidadActual: nuevaCantidad, costoPromedio: costoUnitario },
    });
    return { movimiento, actualizado };
  });

  res.status(201).json({ movimiento: serializarMovimiento(resultado.movimiento), actualizado: serializarProducto(resultado.actualizado) });
}
