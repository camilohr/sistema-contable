import { Request, Response } from "express";
import { EstadoComprobante, EstadoNomina, EstadoPeriodo } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { evaluarAlertas } from "../lib/alertas.js";

function inicioDeHoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function avanceProceso(p: { id: string; anio: number; estado: string; actividades: { estado: boolean }[] }) {
  const total = p.actividades.length;
  const completadas = p.actividades.filter((a) => a.estado).length;
  return {
    id: p.id,
    anio: p.anio,
    estado: p.estado,
    avance: { total, completadas, porcentaje: total > 0 ? Math.round((completadas / total) * 100) : 0 },
  };
}

export async function resumen(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  const hoy = inicioDeHoy();

  const [abiertos, vencidos, borradores, contabilizados, ultimoPeriodo] = await Promise.all([
    prisma.periodo.count({ where: { empresaId, estado: EstadoPeriodo.ABIERTO } }),
    prisma.periodo.count({ where: { empresaId, estado: EstadoPeriodo.ABIERTO, fechaFin: { lt: hoy } } }),
    prisma.comprobante.count({ where: { empresaId, estado: EstadoComprobante.BORRADOR } }),
    prisma.comprobante.count({ where: { empresaId, estado: EstadoComprobante.CONTABILIZADO } }),
    prisma.periodo.findFirst({ where: { empresaId }, orderBy: { fechaFin: "desc" } }),
  ]);

  let periodoObjetivo: { id: number; nombre: string; anio: number } | null = null;
  let proceso = null;
  let nomina = null;
  let provision = null;
  let presupuesto = null;
  let cierreAnio: { anio: number; cerrado: boolean } | null = null;

  if (ultimoPeriodo) {
    const anio = ultimoPeriodo.fechaFin.getFullYear();
    periodoObjetivo = { id: ultimoPeriodo.id, nombre: ultimoPeriodo.nombre, anio };

    const [nominaOk, provisionOk, presupuestoOk, procesoRow, cierreRow] = await Promise.all([
      prisma.nomina.count({ where: { periodoId: ultimoPeriodo.id, estado: EstadoNomina.CONTABILIZADO } }),
      prisma.provisionCartera.count({ where: { periodoId: ultimoPeriodo.id } }),
      prisma.presupuesto.count({ where: { periodoId: ultimoPeriodo.id } }),
      prisma.procesoContable.findUnique({
        where: { empresaId_anio: { empresaId, anio } },
        include: { actividades: { select: { estado: true } } },
      }),
      prisma.cierreAnual.findFirst({ where: { empresaId, anio } }),
    ]);

    nomina = { contabilizada: nominaOk > 0, periodoId: ultimoPeriodo.id };
    provision = { calculada: provisionOk > 0, periodoId: ultimoPeriodo.id };
    presupuesto = { cargado: presupuestoOk > 0, periodoId: ultimoPeriodo.id, partidas: presupuestoOk };
    proceso = procesoRow ? avanceProceso(procesoRow) : null;
    cierreAnio = { anio, cerrado: !!cierreRow };
  }

  const alertasList = await evaluarAlertas(empresaId);
  const alertas = {
    total: alertasList.length,
    altas: alertasList.filter((a) => a.severidad === "ALTA").length,
    medias: alertasList.filter((a) => a.severidad === "MEDIA").length,
    bajas: alertasList.filter((a) => a.severidad === "BAJA").length,
  };

  res.json({
    empresa: req.empresa,
    periodoObjetivo,
    proceso,
    periodos: { abiertos, vencidos },
    comprobantes: { borradores, contabilizados },
    nomina,
    provision,
    presupuesto,
    cierreAnio,
    alertas,
  });
}
