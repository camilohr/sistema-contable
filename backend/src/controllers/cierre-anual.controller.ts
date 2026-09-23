import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { cerrarAnioOrquestado } from "../lib/cierre.js";

export async function listar(req: Request, res: Response): Promise<void> {
  const cierres = await prisma.cierreAnual.findMany({
    where: { empresaId: req.empresaId },
    orderBy: { anio: "desc" },
    include: {
      comprobante: { select: { consecutivo: true, fecha: true } },
      cuentaUtilidad: { select: { codigo: true, nombre: true } },
      usuario: { select: { nombre: true } },
    },
  });
  res.json(cierres.map((c) => ({
    id: c.id,
    anio: c.anio,
    fecha: c.fecha.toISOString(),
    comprobanteId: c.comprobanteId,
    consecutivo: c.comprobante.consecutivo,
    comprobanteFecha: c.comprobante.fecha.toISOString().slice(0, 10),
    cuentaUtilidadId: c.cuentaUtilidadId,
    codigoCuentaUtilidad: c.cuentaUtilidad.codigo,
    nombreCuentaUtilidad: c.cuentaUtilidad.nombre,
    usuario: c.usuario.nombre,
  })));
}

export async function obtener(req: Request, res: Response): Promise<void> {
  const anio = Number(req.params.anio);
  if (!Number.isInteger(anio)) {
    res.status(400).json({ error: "Año inválido" });
    return;
  }
  const cierre = await prisma.cierreAnual.findFirst({
    where: { anio, empresaId: req.empresaId },
    include: {
      comprobante: {
        include: {
          asientos: { include: { cuenta: { select: { codigo: true, nombre: true } } } },
        },
      },
      cuentaUtilidad: { select: { codigo: true, nombre: true } },
      usuario: { select: { nombre: true } },
    },
  });
  if (!cierre) {
    res.status(404).json({ error: `El año ${anio} no ha sido cerrado` });
    return;
  }
  res.json({
    id: cierre.id,
    anio: cierre.anio,
    fecha: cierre.fecha.toISOString(),
    comprobanteId: cierre.comprobanteId,
    comprobante: {
      id: cierre.comprobante.id,
      tipo: cierre.comprobante.tipo,
      consecutivo: cierre.comprobante.consecutivo,
      fecha: cierre.comprobante.fecha.toISOString().slice(0, 10),
      concepto: cierre.comprobante.concepto,
      totalDebito: cierre.comprobante.totalDebito.toNumber(),
      totalCredito: cierre.comprobante.totalCredito.toNumber(),
      asientos: cierre.comprobante.asientos.map((a) => ({
        codigoCuenta: a.cuenta.codigo,
        nombreCuenta: a.cuenta.nombre,
        debito: a.debito.toNumber(),
        credito: a.credito.toNumber(),
        detalle: a.detalle,
      })),
    },
    cuentaUtilidadId: cierre.cuentaUtilidadId,
    codigoCuentaUtilidad: cierre.cuentaUtilidad.codigo,
    nombreCuentaUtilidad: cierre.cuentaUtilidad.nombre,
    usuario: cierre.usuario.nombre,
  });
}

export async function cerrarAnio(req: Request, res: Response): Promise<void> {
  const r = await cerrarAnioOrquestado({
    empresaId: req.empresaId,
    usuarioId: req.user!.sub,
    anio: Number(req.params.anio),
    body: req.body,
  });
  res.status(r.status).json(r.body);
}