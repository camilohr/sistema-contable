import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, AccionAuditoria, EstadoComprobante } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { saldosPorCuenta } from "./reportes.controller.js";

const cargarSchema = z.object({
  partidas: z
    .array(
      z.object({
        cuentaId: z.number().int().positive(),
        valor: z.number().nonnegative(),
      })
    )
    .max(500),
});

const redondear2 = (n: number) => Math.round(n * 100) / 100;

async function periodoValido(periodoId: number, empresaId: string) {
  return prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
}

export async function listarPorPeriodo(req: Request, res: Response): Promise<void> {
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await periodoValido(periodoId, req.empresaId!);
  if (!periodo) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }

  const partidas = await prisma.presupuesto.findMany({
    where: { periodoId },
    include: { cuenta: { select: { codigo: true, nombre: true, clase: true, naturaleza: true } } },
    orderBy: { cuenta: { codigo: "asc" } },
  });

  res.json({
    periodo: { id: periodo.id, nombre: periodo.nombre, estado: periodo.estado },
    totalPresupuestado: redondear2(partidas.reduce((s, p) => s + p.valor.toNumber(), 0)),
    partidas: partidas.map((p) => ({
      id: p.id,
      cuentaId: p.cuentaId,
      codigo: p.cuenta.codigo,
      nombre: p.cuenta.nombre,
      clase: p.cuenta.clase,
      naturaleza: p.cuenta.naturaleza,
      valor: p.valor.toNumber(),
    })),
  });
}

export async function cargar(req: Request, res: Response): Promise<void> {
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const parsed = cargarSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }

  const periodo = await periodoValido(periodoId, req.empresaId!);
  if (!periodo) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }

  const porCuenta = new Map<number, number>();
  for (const p of parsed.data.partidas) porCuenta.set(p.cuentaId, p.valor);
  const cuentaIds = [...porCuenta.keys()];

  if (cuentaIds.length > 0) {
    const cuentas = await prisma.cuenta.findMany({ where: { id: { in: cuentaIds }, OR: [{ empresaId: null }, { empresaId: req.empresaId }] } });
    const invalidas = cuentas.filter((c) => !c.activa || !c.permiteMovimiento);
    if (invalidas.length > 0) {
      res.status(400).json({
        error: `Las cuentas ${invalidas.map((c) => c.codigo).join(", ")} deben estar activas y permitir movimiento`,
      });
      return;
    }
    if (cuentas.length !== cuentaIds.length) {
      res.status(400).json({ error: "Alguna cuenta del presupuesto no existe" });
      return;
    }
  }

  const totalPresupuestado = redondear2([...porCuenta.values()].reduce((s, v) => s + v, 0));

  const resultado = await prisma.$transaction(async (tx) => {
    if (cuentaIds.length === 0) {
      await tx.presupuesto.deleteMany({ where: { periodoId } });
    } else {
      await tx.presupuesto.deleteMany({ where: { periodoId, cuentaId: { notIn: cuentaIds } } });
      for (const [cuentaId, valor] of porCuenta) {
        await tx.presupuesto.upsert({
          where: { cuentaId_periodoId: { cuentaId, periodoId } },
          create: { cuentaId, periodoId, valor: new Prisma.Decimal(valor) },
          update: { valor: new Prisma.Decimal(valor) },
        });
      }
    }
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.CARGAR_PRESUPUESTO,
      entidad: "Periodo",
      entidadId: periodoId,
      detalle: {
        nombre: periodo.nombre,
        partidas: porCuenta.size,
        totalPresupuestado,
      },
    });
    return tx.presupuesto.findMany({
      where: { periodoId },
      include: { cuenta: { select: { codigo: true, nombre: true } } },
      orderBy: { cuenta: { codigo: "asc" } },
    });
  });

  res.json({
    periodo: { id: periodo.id, nombre: periodo.nombre, estado: periodo.estado },
    totalPresupuestado,
    partidas: resultado.map((p) => ({
      id: p.id,
      cuentaId: p.cuentaId,
      codigo: p.cuenta.codigo,
      nombre: p.cuenta.nombre,
      valor: p.valor.toNumber(),
    })),
  });
}

export async function ejecucion(req: Request, res: Response): Promise<void> {
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await periodoValido(periodoId, req.empresaId!);
  if (!periodo) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }

  const [partidas, saldos] = await Promise.all([
    prisma.presupuesto.findMany({
      where: { periodoId },
      include: { cuenta: { select: { codigo: true, nombre: true, clase: true, naturaleza: true } } },
    }),
    saldosPorCuenta({ estado: EstadoComprobante.CONTABILIZADO, periodoId, empresaId: req.empresaId }),
  ]);

  const saldoPorCodigo = new Map(saldos.map((s) => [s.codigo, s.saldo]));

  const lineas = partidas
    .map((p) => {
      const ejecutado = redondear2(saldoPorCodigo.get(p.cuenta.codigo) ?? 0);
      const presupuestado = p.valor.toNumber();
      const variacion = redondear2(ejecutado - presupuestado);
      const porcentajeEjecucion = presupuestado > 0 ? Math.round((ejecutado / presupuestado) * 10000) / 100 : null;
      return {
        cuentaId: p.cuentaId,
        codigo: p.cuenta.codigo,
        nombre: p.cuenta.nombre,
        clase: p.cuenta.clase,
        naturaleza: p.cuenta.naturaleza,
        presupuestado,
        ejecutado,
        variacion,
        porcentajeEjecucion,
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  const totalPresupuestado = redondear2(lineas.reduce((s, l) => s + l.presupuestado, 0));
  const totalEjecutado = redondear2(lineas.reduce((s, l) => s + l.ejecutado, 0));

  res.json({
    periodo: { id: periodo.id, nombre: periodo.nombre, estado: periodo.estado },
    totalPresupuestado,
    totalEjecutado,
    variacionTotal: redondear2(totalEjecutado - totalPresupuestado),
    porcentajeEjecucionTotal: totalPresupuestado > 0 ? Math.round((totalEjecutado / totalPresupuestado) * 10000) / 100 : null,
    lineas,
  });
}
