import { Request, Response } from "express";
import { z } from "zod";
import { EstadoComprobante, EstadoPeriodo, EstadoProceso, TipoActividadProceso, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { crearComprobanteDiario, AsientoGenerado } from "../lib/comprobantes.js";
import { marcarActividadProceso } from "../lib/procesos.js";

const cerrarSchema = z.object({
  cuentaUtilidadId: z.number().int().positive().optional(),
});

const redondear2 = (n: number) => Math.round(n * 100) / 100;

const CLASES_RESULTADO = [4, 5, 6, 7];

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
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const anio = Number(req.params.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    res.status(400).json({ error: "Año inválido" });
    return;
  }

  const parsed = cerrarSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }

  const yaCerrado = await prisma.cierreAnual.findFirst({ where: { anio, empresaId } });
  if (yaCerrado) {
    res.status(400).json({ error: `El año ${anio} ya fue cerrado` });
    return;
  }

  const inicio = new Date(`${anio}-01-01`);
  const fin = new Date(`${anio}-12-31`);
  const periodos = await prisma.periodo.findMany({
    where: { empresaId, fechaInicio: { lte: fin }, fechaFin: { gte: inicio } },
    orderBy: { fechaFin: "asc" },
  });
  if (periodos.length === 0) {
    res.status(400).json({ error: `No hay periodos para el año ${anio}` });
    return;
  }
  const abiertos = periodos.filter((p) => p.estado !== EstadoPeriodo.CERRADO);
  if (abiertos.length > 0) {
    res.status(400).json({ error: `No se puede cerrar el año: hay periodos abiertos (${abiertos.map((p) => p.nombre).join(", ")})` });
    return;
  }

  let cuentaUtilidadId = parsed.data.cuentaUtilidadId;
  if (cuentaUtilidadId) {
    const cuenta = await prisma.cuenta.findFirst({
      where: { id: cuentaUtilidadId, OR: [{ empresaId: null }, { empresaId }] },
    });
    if (!cuenta || cuenta.clase !== 3 || !cuenta.activa || !cuenta.permiteMovimiento) {
      res.status(400).json({ error: "La cuenta de utilidades debe ser una cuenta de patrimonio (clase 3), activa y con movimiento" });
      return;
    }
  } else {
    const porDefecto = await prisma.cuenta.findFirst({
      where: { codigo: "3605", OR: [{ empresaId: null }, { empresaId }] },
    });
    if (!porDefecto || porDefecto.clase !== 3) {
      res.status(400).json({ error: "No se encontró la cuenta 3605 (Utilidad del ejercicio); indique una cuenta de utilidades" });
      return;
    }
    cuentaUtilidadId = porDefecto.id;
  }

  const comprobantes = await prisma.comprobante.findMany({
    where: { empresaId, estado: EstadoComprobante.CONTABILIZADO, periodoId: { in: periodos.map((p) => p.id) } },
    select: {
      asientos: {
        include: { cuenta: { select: { id: true, codigo: true, nombre: true, clase: true, naturaleza: true } } },
      },
    },
  });

  interface Acumulado {
    id: number;
    codigo: string;
    nombre: string;
    clase: number;
    debitos: number;
    creditos: number;
  }
  const porCuenta = new Map<number, Acumulado>();
  for (const c of comprobantes) {
    for (const a of c.asientos) {
      const act = porCuenta.get(a.cuenta.id) ?? {
        id: a.cuenta.id,
        codigo: a.cuenta.codigo,
        nombre: a.cuenta.nombre,
        clase: a.cuenta.clase,
        debitos: 0,
        creditos: 0,
      };
      act.debitos += a.debito.toNumber();
      act.creditos += a.credito.toNumber();
      porCuenta.set(a.cuenta.id, act);
    }
  }

  const asientos: AsientoGenerado[] = [];
  for (const c of [...porCuenta.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))) {
    if (!CLASES_RESULTADO.includes(c.clase)) continue;
    const saldo = c.clase === 4 ? c.creditos - c.debitos : c.debitos - c.creditos;
    const monto = redondear2(saldo);
    if (monto === 0) continue;
    if (c.clase === 4) {
      if (monto > 0) {
        asientos.push({ cuentaId: c.id, debito: monto, credito: 0, detalle: `Cierre ${anio}: ${c.codigo} ${c.nombre}` });
      } else {
        asientos.push({ cuentaId: c.id, debito: 0, credito: -monto, detalle: `Cierre ${anio}: ${c.codigo} ${c.nombre} (saldo inverso)` });
      }
    } else {
      if (monto > 0) {
        asientos.push({ cuentaId: c.id, debito: 0, credito: monto, detalle: `Cierre ${anio}: ${c.codigo} ${c.nombre}` });
      } else {
        asientos.push({ cuentaId: c.id, debito: -monto, credito: 0, detalle: `Cierre ${anio}: ${c.codigo} ${c.nombre} (saldo inverso)` });
      }
    }
  }

  if (asientos.length === 0) {
    res.status(400).json({ error: `No hay cuentas de resultado con saldo para cerrar en el año ${anio}` });
    return;
  }

  const totalDebitos = redondear2(asientos.reduce((s, a) => s + a.debito, 0));
  const totalCreditos = redondear2(asientos.reduce((s, a) => s + a.credito, 0));
  const debitoIngresos = totalDebitos;
  const creditoGastos = totalCreditos;
  const resultado = redondear2(debitoIngresos - creditoGastos);

  if (resultado > 0) {
    asientos.push({ cuentaId: cuentaUtilidadId, debito: 0, credito: resultado, detalle: `Utilidad del ejercicio ${anio}` });
  } else if (resultado < 0) {
    asientos.push({ cuentaId: cuentaUtilidadId, debito: -resultado, credito: 0, detalle: `Pérdida del ejercicio ${anio}` });
  }

  const ultimoPeriodo = periodos[periodos.length - 1];
  const fechaCierre = ultimoPeriodo.fechaFin;

  const cuentaUtilidad = await prisma.cuenta.findFirst({
    where: { id: cuentaUtilidadId, OR: [{ empresaId: null }, { empresaId }] },
  });

  const resultadoTransaccion = await prisma.$transaction(async (tx) => {
    const comprobante = await crearComprobanteDiario(tx, {
      empresaId,
      periodoId: ultimoPeriodo.id,
      fecha: fechaCierre,
      concepto: `Cierre de ejercicio ${anio}`,
      usuarioId: req.user!.sub,
      asientos,
    });
    const cierre = await tx.cierreAnual.create({
      data: {
        empresaId,
        anio,
        comprobanteId: comprobante.id,
        cuentaUtilidadId,
        usuarioId: req.user!.sub,
      },
      include: { cuentaUtilidad: { select: { codigo: true, nombre: true } } },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId,
      accion: AccionAuditoria.CERRAR_ANIO,
      entidad: "Anio",
      entidadId: anio,
      detalle: {
        comprobanteId: comprobante.id,
        totalDebito: comprobante.totalDebito.toNumber(),
        totalCredito: comprobante.totalCredito.toNumber(),
        resultado,
        cuentaUtilidad: cuentaUtilidad!.codigo,
      },
    });
    await marcarActividadProceso(tx, empresaId, anio, TipoActividadProceso.CIERRE_ANIO, fechaCierre);
    await tx.procesoContable.updateMany({
      where: { empresaId, anio },
      data: { estado: EstadoProceso.CERRADO },
    });
    return { comprobante, cierre };
  });

  res.status(201).json({
    cierre: {
      id: resultadoTransaccion.cierre.id,
      anio,
      fecha: resultadoTransaccion.cierre.fecha.toISOString(),
      comprobanteId: resultadoTransaccion.comprobante.id,
      cuentaUtilidadId,
      codigoCuentaUtilidad: resultadoTransaccion.cierre.cuentaUtilidad.codigo,
      nombreCuentaUtilidad: resultadoTransaccion.cierre.cuentaUtilidad.nombre,
    },
    comprobante: {
      id: resultadoTransaccion.comprobante.id,
      tipo: resultadoTransaccion.comprobante.tipo,
      consecutivo: resultadoTransaccion.comprobante.consecutivo,
      fecha: resultadoTransaccion.comprobante.fecha.toISOString().slice(0, 10),
      concepto: resultadoTransaccion.comprobante.concepto,
      totalDebito: resultadoTransaccion.comprobante.totalDebito.toNumber(),
      totalCredito: resultadoTransaccion.comprobante.totalCredito.toNumber(),
      numAsientos: resultadoTransaccion.comprobante.asientos.length,
    },
    resumen: { debitoIngresos, creditoGastos, resultado },
    asientos: resultadoTransaccion.comprobante.asientos.map((a) => ({
      codigoCuenta: (a as { cuenta?: { codigo: string } }).cuenta?.codigo,
      debito: a.debito.toNumber(),
      credito: a.credito.toNumber(),
      detalle: a.detalle,
    })),
  });
}
