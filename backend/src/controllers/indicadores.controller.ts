import { Request, Response } from "express";
import { EstadoComprobante } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { saldosPorCuenta } from "./reportes.controller.js";
import {
  agregarDatos,
  analisisHorizontal,
  analisisVertical,
  calcularRazones,
  Razones,
} from "../lib/indicadores.js";

const redondear = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100);

function mapearRazones(r: Razones) {
  return {
    razonCorriente: redondear(r.razonCorriente),
    pruebaAcida: redondear(r.pruebaAcida),
    endeudamiento: redondear(r.endeudamiento),
    margenNeto: redondear(r.margenNeto),
    rotacionCartera: redondear(r.rotacionCartera),
    rotacionInventario: redondear(r.rotacionInventario),
  };
}

export async function indicadoresPorPeriodo(req: Request, res: Response): Promise<void> {
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "periodoId inválido" });
    return;
  }

  const periodo = await prisma.periodo.findUnique({ where: { id: periodoId } });
  if (!periodo) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }

  const saldos = await saldosPorCuenta({ estado: EstadoComprobante.CONTABILIZADO, periodoId });
  const datos = agregarDatos(saldos);

  res.json({
    periodo: { id: periodo.id, nombre: periodo.nombre },
    datos,
    razones: mapearRazones(calcularRazones(datos)),
  });
}

export async function indicadoresComparativo(req: Request, res: Response): Promise<void> {
  const desde = Number(req.query.desde);
  const hasta = Number(req.query.hasta);
  if (!Number.isInteger(desde) || !Number.isInteger(hasta)) {
    res.status(400).json({ error: "Se requieren los parámetros 'desde' y 'hasta' (ids de periodo)" });
    return;
  }

  const [pDesde, pHasta] = await Promise.all([
    prisma.periodo.findUnique({ where: { id: desde } }),
    prisma.periodo.findUnique({ where: { id: hasta } }),
  ]);
  if (!pDesde || !pHasta) {
    res.status(404).json({ error: "Periodo no encontrado" });
    return;
  }

  const [saldosDesde, saldosHasta] = await Promise.all([
    saldosPorCuenta({ estado: EstadoComprobante.CONTABILIZADO, periodoId: desde }),
    saldosPorCuenta({ estado: EstadoComprobante.CONTABILIZADO, periodoId: hasta }),
  ]);

  const datosDesde = agregarDatos(saldosDesde);
  const datosHasta = agregarDatos(saldosHasta);
  const promedios = {
    carteraPromedio: (datosDesde.cartera + datosHasta.cartera) / 2,
    inventarioPromedio: (datosDesde.inventario + datosHasta.inventario) / 2,
  };

  res.json({
    periodos: { desde: { id: pDesde.id, nombre: pDesde.nombre }, hasta: { id: pHasta.id, nombre: pHasta.nombre } },
    datos: { desde: datosDesde, hasta: datosHasta },
    razones: {
      desde: mapearRazones(calcularRazones(datosDesde)),
      hasta: mapearRazones(calcularRazones(datosHasta, promedios)),
    },
    vertical: analisisVertical(saldosDesde, saldosHasta),
    horizontal: analisisHorizontal(saldosDesde, saldosHasta),
  });
}
