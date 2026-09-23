import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, EstadoPeriodo, EstadoComprobante, TipoActividadProceso, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { marcarActividadProceso } from "../lib/procesos.js";
import { num, redondear2 } from "../lib/decimal.js";
import {
  CONCEPTOS,
  INCLUDE_NOMINA,
  serializarLinea,
  calcularTotales,
  liquidarOrquestado,
  contabilizarOrquestado,
  provisionarOrquestado,
} from "../lib/nomina.js";

// ---------------- Parámetros ----------------

export async function obtenerParametros(req: Request, res: Response): Promise<void> {
  const filas = await prisma.parametroNomina.findMany({
    where: { OR: [{ empresaId: null }, { empresaId: req.empresaId }] },
    orderBy: { anio: "asc" },
  });
  const porAnio = new Map<number, (typeof filas)[number]>();
  for (const p of filas) {
    if (!porAnio.has(p.anio) || p.empresaId === req.empresaId) porAnio.set(p.anio, p);
  }
  res.json([...porAnio.values()].sort((a, b) => a.anio - b.anio).map(serializarParametro));
}

const parametroSchema = z.object({
  smmlv: z.number().positive(),
  auxilioTransporte: z.number().min(0),
  topeAuxilioTransporteSalarios: z.number().positive(),
  topeIbcSalarios: z.number().positive(),
  saludEmpleado: z.number().min(0).max(100),
  pensionEmpleado: z.number().min(0).max(100),
  saludEmpleador: z.number().min(0).max(100),
  pensionEmpleador: z.number().min(0).max(100),
  arlEmpleador: z.number().min(0).max(100),
  cajaCompensacion: z.number().min(0).max(100),
  icbf: z.number().min(0).max(100),
  sena: z.number().min(0).max(100),
  umbralParafiscales: z.number().int().min(1),
  solidaridadUmbralSalarios: z.number().positive(),
  interesesCesantias: z.number().min(0).max(100),
  cesantias: z.number().min(0).max(100).optional(),
  prima: z.number().min(0).max(100).optional(),
  vacaciones: z.number().min(0).max(100).optional(),
});

function serializarParametro(p: {
  anio: number; smmlv: Prisma.Decimal; auxilioTransporte: Prisma.Decimal; topeAuxilioTransporteSalarios: Prisma.Decimal;
  topeIbcSalarios: Prisma.Decimal; saludEmpleado: Prisma.Decimal; pensionEmpleado: Prisma.Decimal;
  saludEmpleador: Prisma.Decimal; pensionEmpleador: Prisma.Decimal; arlEmpleador: Prisma.Decimal;
  cajaCompensacion: Prisma.Decimal; icbf: Prisma.Decimal; sena: Prisma.Decimal; umbralParafiscales: number;
  solidaridadUmbralSalarios: Prisma.Decimal; interesesCesantias: Prisma.Decimal;
  cesantias: Prisma.Decimal; prima: Prisma.Decimal; vacaciones: Prisma.Decimal;
}) {
  return {
    anio: p.anio,
    smmlv: num(p.smmlv),
    auxilioTransporte: num(p.auxilioTransporte),
    topeAuxilioTransporteSalarios: num(p.topeAuxilioTransporteSalarios),
    topeIbcSalarios: num(p.topeIbcSalarios),
    saludEmpleado: num(p.saludEmpleado),
    pensionEmpleado: num(p.pensionEmpleado),
    saludEmpleador: num(p.saludEmpleador),
    pensionEmpleador: num(p.pensionEmpleador),
    arlEmpleador: num(p.arlEmpleador),
    cajaCompensacion: num(p.cajaCompensacion),
    icbf: num(p.icbf),
    sena: num(p.sena),
    umbralParafiscales: p.umbralParafiscales,
    solidaridadUmbralSalarios: num(p.solidaridadUmbralSalarios),
    interesesCesantias: num(p.interesesCesantias),
    cesantias: num(p.cesantias),
    prima: num(p.prima),
    vacaciones: num(p.vacaciones),
  };
}

export async function actualizarParametros(req: Request, res: Response): Promise<void> {
  const anio = Number(req.params.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    res.status(400).json({ error: "Año inválido" });
    return;
  }
  const parsed = parametroSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const aDecimales: Omit<Prisma.ParametroNominaUncheckedCreateInput, "anio"> = {
    smmlv: new Prisma.Decimal(data.smmlv),
    auxilioTransporte: new Prisma.Decimal(data.auxilioTransporte),
    topeAuxilioTransporteSalarios: new Prisma.Decimal(data.topeAuxilioTransporteSalarios),
    topeIbcSalarios: new Prisma.Decimal(data.topeIbcSalarios),
    saludEmpleado: new Prisma.Decimal(data.saludEmpleado),
    pensionEmpleado: new Prisma.Decimal(data.pensionEmpleado),
    saludEmpleador: new Prisma.Decimal(data.saludEmpleador),
    pensionEmpleador: new Prisma.Decimal(data.pensionEmpleador),
    arlEmpleador: new Prisma.Decimal(data.arlEmpleador),
    cajaCompensacion: new Prisma.Decimal(data.cajaCompensacion),
    icbf: new Prisma.Decimal(data.icbf),
    sena: new Prisma.Decimal(data.sena),
    umbralParafiscales: data.umbralParafiscales,
    solidaridadUmbralSalarios: new Prisma.Decimal(data.solidaridadUmbralSalarios),
    interesesCesantias: new Prisma.Decimal(data.interesesCesantias),
    cesantias: data.cesantias !== undefined ? new Prisma.Decimal(data.cesantias) : undefined,
    prima: data.prima !== undefined ? new Prisma.Decimal(data.prima) : undefined,
    vacaciones: data.vacaciones !== undefined ? new Prisma.Decimal(data.vacaciones) : undefined,
  };
  const guardado = await prisma.$transaction(async (tx) => {
    const p = await tx.parametroNomina.upsert({
      where: { empresaId_anio: { empresaId: req.empresaId!, anio } },
      update: aDecimales,
      create: { empresaId: req.empresaId!, anio, ...aDecimales },
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.ACTUALIZAR_PARAMETROS_NOMINA,
      entidad: "ParametroNomina",
      entidadId: anio,
      detalle: { smmlv: data.smmlv, auxilioTransporte: data.auxilioTransporte },
    });
    return p;
  });
  res.json(serializarParametro(guardado));
}

export async function obtenerParametrosCuentas(req: Request, res: Response): Promise<void> {
  const filas = await prisma.parametroCuentaNomina.findMany({
    where: { empresaId: req.empresaId },
    orderBy: { concepto: "asc" },
    include: { cuenta: { select: { codigo: true, nombre: true } } },
  });
  res.json(
    filas.map((f) => ({
      concepto: f.concepto,
      cuentaId: f.cuentaId,
      codigoCuenta: f.cuenta.codigo,
      nombreCuenta: f.cuenta.nombre,
    }))
  );
}

const cuentasSchema = z.object({
  cuentas: z
    .array(z.object({ concepto: z.string().min(1), cuentaId: z.number().int().positive() }))
    .min(1),
});

export async function actualizarParametrosCuentas(req: Request, res: Response): Promise<void> {
  const parsed = cuentasSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const items = parsed.data.cuentas;
  const conceptos = items.map((i) => i.concepto);
  if (new Set(conceptos).size !== conceptos.length) {
    res.status(400).json({ error: "No puede haber conceptos duplicados" });
    return;
  }
  const desconocidos = conceptos.filter((c) => !CONCEPTOS.includes(c));
  if (desconocidos.length > 0) {
    res.status(400).json({ error: `Conceptos desconocidos: ${desconocidos.join(", ")}` });
    return;
  }
  const ids = [...new Set(items.map((i) => i.cuentaId))];
  const cuentas = await prisma.cuenta.findMany({ where: { id: { in: ids } } });
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  for (const i of items) {
    const c = porId.get(i.cuentaId);
    if (!c) {
      res.status(400).json({ error: `La cuenta ${i.cuentaId} no existe` });
      return;
    }
    if (!c.activa || !c.permiteMovimiento) {
      res.status(400).json({ error: `La cuenta ${c.codigo} (${c.nombre}) debe estar activa y permitir movimiento` });
      return;
    }
  }
  const guardadas = await prisma.$transaction(async (tx) => {
    await tx.parametroCuentaNomina.deleteMany({ where: { empresaId: req.empresaId } });
    await tx.parametroCuentaNomina.createMany({
      data: items.map((i) => ({ empresaId: req.empresaId!, concepto: i.concepto, cuentaId: i.cuentaId })),
    });
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.ACTUALIZAR_PARAMETROS_NOMINA,
      entidad: "ParametroCuentaNomina",
      entidadId: 0,
      detalle: { conceptos: conceptos.length },
    });
    return tx.parametroCuentaNomina.findMany({ where: { empresaId: req.empresaId }, include: { cuenta: { select: { codigo: true, nombre: true } } } });
  });
  res.json(
    guardadas.map((f) => ({
      concepto: f.concepto,
      cuentaId: f.cuentaId,
      codigoCuenta: f.cuenta.codigo,
      nombreCuenta: f.cuenta.nombre,
    }))
  );
}

// ---------------- Liquidación ----------------

export async function liquidar(req: Request, res: Response): Promise<void> {
  const r = await liquidarOrquestado({
    empresaId: req.empresaId!,
    usuarioId: req.user!.sub,
    periodoId: Number(req.params.periodoId),
    body: req.body,
  });
  res.status(r.status).json(r.body);
}

export async function obtenerLiquidacion(req: Request, res: Response): Promise<void> {
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId: req.empresaId } });
  if (!periodo) {
    res.status(404).json({ error: `No existe el periodo ${periodoId}` });
    return;
  }
  const lineas = await prisma.nomina.findMany({
    where: { periodoId },
    orderBy: { empleado: { createdAt: "asc" } },
    include: INCLUDE_NOMINA,
  });
  if (lineas.length === 0) {
    res.status(404).json({ error: `No hay nómina liquidada para el periodo ${periodo.nombre}` });
    return;
  }
  res.json({
    periodo: periodo.nombre,
    periodoId,
    lineas: lineas.map((n) => serializarLinea(n)),
    totales: calcularTotales(lineas),
  });
}

// ---------------- Contabilización ----------------

export async function contabilizar(req: Request, res: Response): Promise<void> {
  const r = await contabilizarOrquestado({
    empresaId: req.empresaId,
    usuarioId: req.user!.sub,
    periodoId: Number(req.params.periodoId),
  });
  res.status(r.status).json(r.body);
}

// ---------------- Provisión de prestaciones ----------------

export async function provisionar(req: Request, res: Response): Promise<void> {
  const r = await provisionarOrquestado({
    empresaId: req.empresaId!,
    usuarioId: req.user!.sub,
    periodoId: Number(req.params.periodoId),
  });
  res.status(r.status).json(r.body);
}

export async function contabilizarProvision(req: Request, res: Response): Promise<void> {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa no seleccionada" });
    return;
  }
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) {
    res.status(404).json({ error: `No existe el periodo ${periodoId}` });
    return;
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    res.status(400).json({ error: "El periodo está cerrado" });
    return;
  }
  const lineas = await prisma.provisionNomina.findMany({
    where: { periodoId },
    include: { comprobante: true },
  });
  if (lineas.length === 0) {
    res.status(400).json({ error: "Primero calcule la provisión del periodo (queda en borrador)" });
    return;
  }
  const comprobante = lineas[0].comprobante;
  if (!comprobante) {
    res.status(400).json({ error: "La provisión no tiene comprobante asociado; vuelva a calcularla" });
    return;
  }
  if (comprobante.estado === EstadoComprobante.CONTABILIZADO) {
    res.status(400).json({ error: "La provisión del periodo ya está contabilizada" });
    return;
  }
  if (comprobante.estado !== EstadoComprobante.BORRADOR) {
    res.status(400).json({ error: "El comprobante de provisión no está en borrador" });
    return;
  }

  const usuarioId = req.user!.sub;
  const resultado = await prisma.$transaction(async (tx) => {
    const c = await tx.comprobante.update({
      where: { id: comprobante.id },
      data: { estado: EstadoComprobante.CONTABILIZADO },
      include: { asientos: { include: { cuenta: { select: { codigo: true } } } }, periodo: true },
    });
    await registrarAuditoria(tx, {
      usuarioId,
      empresaId,
      accion: AccionAuditoria.CONTABILIZAR,
      entidad: "Comprobante",
      entidadId: comprobante.id,
      detalle: { consecutivo: c.consecutivo, concepto: c.concepto, origen: "provision-nomina", periodo: periodo.nombre },
    });
    await marcarActividadProceso(tx, empresaId, periodo.fechaFin.getFullYear(), TipoActividadProceso.NOMINA);
    return c;
  });

  res.status(200).json({
    comprobante: {
      id: resultado.id,
      consecutivo: resultado.consecutivo,
      concepto: resultado.concepto,
      estado: resultado.estado,
      totalDebito: num(resultado.totalDebito),
      totalCredito: num(resultado.totalCredito),
      numAsientos: resultado.asientos.length,
    },
    total: redondear2(lineas.reduce((s, l) => s + num(l.total), 0)),
  });
}

export async function obtenerProvision(req: Request, res: Response): Promise<void> {
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "Periodo inválido" });
    return;
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId: req.empresaId } });
  if (!periodo) {
    res.status(404).json({ error: `No existe el periodo ${periodoId}` });
    return;
  }
  const lineas = await prisma.provisionNomina.findMany({
    where: { periodoId },
    orderBy: { empleado: { createdAt: "asc" } },
    include: {
      empleado: { include: { tercero: { select: { nombreRazonSocial: true, documento: true } } } },
      comprobante: { include: { asientos: { include: { cuenta: { select: { codigo: true, nombre: true } } } } } },
    },
  });
  if (lineas.length === 0) {
    res.status(404).json({ error: `No hay provisión de prestaciones para el periodo ${periodo.nombre}` });
    return;
  }
  const comprobante = lineas[0].comprobante;
  res.json({
    periodo: periodo.nombre,
    periodoId,
    total: redondear2(lineas.reduce((s, l) => s + num(l.total), 0)),
    comprobante: comprobante
      ? {
          id: comprobante.id,
          consecutivo: comprobante.consecutivo,
          estado: comprobante.estado,
          totalDebito: num(comprobante.totalDebito),
          totalCredito: num(comprobante.totalCredito),
          asientos: comprobante.asientos.map((a) => ({
            codigoCuenta: a.cuenta.codigo,
            nombreCuenta: a.cuenta.nombre,
            debito: num(a.debito),
            credito: num(a.credito),
            detalle: a.detalle,
          })),
        }
      : null,
    lineas: lineas.map((l) => ({
      id: l.id,
      empleadoId: l.empleadoId,
      documento: l.empleado.tercero.documento,
      nombre: l.empleado.tercero.nombreRazonSocial,
      baseCesantias: num(l.baseCesantias),
      cesantias: num(l.cesantias),
      interesesCesantias: num(l.interesesCesantias),
      prima: num(l.prima),
      baseVacaciones: num(l.baseVacaciones),
      vacaciones: num(l.vacaciones),
      total: num(l.total),
    })),
  });
}

export const nomina = { obtenerParametros, actualizarParametros, obtenerParametrosCuentas, actualizarParametrosCuentas, liquidar, obtenerLiquidacion, contabilizar, provisionar, contabilizarProvision, obtenerProvision };