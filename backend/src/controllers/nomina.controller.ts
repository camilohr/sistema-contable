import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, EstadoPeriodo, EstadoNomina, TipoActividadProceso, AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { crearComprobanteDiario } from "../lib/comprobantes.js";
import { marcarActividadProceso } from "../lib/procesos.js";
import {
  liquidarEmpleado,
  provisionarEmpleado,
  asientosDeNomina,
  asientosDeProvision,
  redondear2,
  LineaNominaContable,
  ParametrosNominaCalculo,
} from "../lib/nomina.js";

const CONCEPTOS = [
  "SUELDO", "HORAS_EXTRAS", "COMISIONES", "BONIFICACIONES", "AUXILIO_TRANSPORTE", "OTROS_DEVENGADOS",
  "SALUD_GASTO", "SALUD_PASIVO", "PENSION_GASTO", "PENSION_PASIVO", "ARL_GASTO", "ARL_PASIVO",
  "CAJA_GASTO", "CAJA_PASIVO", "ICBF_GASTO", "ICBF_PASIVO", "SENA_GASTO", "SENA_PASIVO",
  "SOLIDARIDAD", "RETEFUENTE", "LIBRANZAS", "EMBARGOS", "OTROS_DESCUENTOS", "NETO_POR_PAGAR",
  "CESANTIAS_GASTO", "CESANTIAS_PASIVO", "INTERESES_CESANTIAS_GASTO", "INTERESES_CESANTIAS_PASIVO",
  "PRIMA_GASTO", "PRIMA_PASIVO", "VACACIONES_GASTO", "VACACIONES_PASIVO",
];

const CONCEPTOS_NOMINA = CONCEPTOS.filter((c) => !c.includes("CESANTIAS") && !c.includes("PRIMA") && !c.includes("VACACIONES"));
const CONCEPTOS_PROVISION = ["CESANTIAS_GASTO", "CESANTIAS_PASIVO", "INTERESES_CESANTIAS_GASTO", "INTERESES_CESANTIAS_PASIVO", "PRIMA_GASTO", "PRIMA_PASIVO", "VACACIONES_GASTO", "VACACIONES_PASIVO"];

function num(x: Prisma.Decimal | null | undefined): number {
  return x ? x.toNumber() : 0;
}

const INCLUDE_NOMINA = {
  empleado: { include: { tercero: { select: { nombreRazonSocial: true, documento: true } } } },
  periodo: { select: { nombre: true, estado: true } },
} satisfies Prisma.NominaInclude;

type NominaConRel = Prisma.NominaGetPayload<{ include: typeof INCLUDE_NOMINA }>;

function serializarLinea(n: NominaConRel) {
  return {
    id: n.id,
    empleadoId: n.empleadoId,
    documento: n.empleado.tercero.documento,
    nombre: n.empleado.tercero.nombreRazonSocial,
    diasTrabajados: n.diasTrabajados,
    sueldo: num(n.sueldo),
    horasExtras: num(n.horasExtras),
    comisiones: num(n.comisiones),
    bonificaciones: num(n.bonificaciones),
    auxilioTransporte: num(n.auxilioTransporte),
    otrosDevengados: num(n.otrosDevengados),
    ibc: num(n.ibc),
    saludEmpleado: num(n.saludEmpleado),
    pensionEmpleado: num(n.pensionEmpleado),
    solidaridad: num(n.solidaridad),
    retefuente: num(n.retefuente),
    libranzas: num(n.libranzas),
    embargos: num(n.embargos),
    otrosDescuentos: num(n.otrosDescuentos),
    aporteSalud: num(n.aporteSalud),
    aportePension: num(n.aportePension),
    aporteArl: num(n.aporteArl),
    aporteCaja: num(n.aporteCaja),
    aporteIcbf: num(n.aporteIcbf),
    aporteSena: num(n.aporteSena),
    totalDevengado: num(n.totalDevengado),
    totalDeducciones: num(n.totalDeducciones),
    netoPagar: num(n.netoPagar),
    estado: n.estado,
    comprobanteId: n.comprobanteId,
  };
}

function aContable(n: NominaConRel): LineaNominaContable {
  return {
    sueldo: num(n.sueldo),
    horasExtras: num(n.horasExtras),
    comisiones: num(n.comisiones),
    bonificaciones: num(n.bonificaciones),
    auxilioTransporte: num(n.auxilioTransporte),
    otrosDevengados: num(n.otrosDevengados),
    ibc: num(n.ibc),
    saludEmpleado: num(n.saludEmpleado),
    pensionEmpleado: num(n.pensionEmpleado),
    solidaridad: num(n.solidaridad),
    retefuente: num(n.retefuente),
    libranzas: num(n.libranzas),
    embargos: num(n.embargos),
    otrosDescuentos: num(n.otrosDescuentos),
    totalDevengado: num(n.totalDevengado),
    totalDeducciones: num(n.totalDeducciones),
    netoPagar: num(n.netoPagar),
    aporteSalud: num(n.aporteSalud),
    aportePension: num(n.aportePension),
    aporteArl: num(n.aporteArl),
    aporteCaja: num(n.aporteCaja),
    aporteIcbf: num(n.aporteIcbf),
    aporteSena: num(n.aporteSena),
  };
}

function calcularTotales(lineas: NominaConRel[]) {
  const suma = (get: (l: NominaConRel) => Prisma.Decimal) => redondear2(lineas.reduce((s, l) => s + num(get(l)), 0));
  return {
    totalDevengado: suma((l) => l.totalDevengado),
    totalDeducciones: suma((l) => l.totalDeducciones),
    netoPagar: suma((l) => l.netoPagar),
    aportes: {
      salud: suma((l) => l.aporteSalud),
      pension: suma((l) => l.aportePension),
      arl: suma((l) => l.aporteArl),
      caja: suma((l) => l.aporteCaja),
      icbf: suma((l) => l.aporteIcbf),
      sena: suma((l) => l.aporteSena),
    },
  };
}

function parametrosCalculo(p: {
  smmlv: Prisma.Decimal; auxilioTransporte: Prisma.Decimal; topeAuxilioTransporteSalarios: Prisma.Decimal;
  topeIbcSalarios: Prisma.Decimal; saludEmpleado: Prisma.Decimal; pensionEmpleado: Prisma.Decimal;
  saludEmpleador: Prisma.Decimal; pensionEmpleador: Prisma.Decimal; cajaCompensacion: Prisma.Decimal;
  icbf: Prisma.Decimal; sena: Prisma.Decimal; umbralParafiscales: number; solidaridadUmbralSalarios: Prisma.Decimal;
}): ParametrosNominaCalculo {
  return {
    smmlv: num(p.smmlv),
    auxilioTransporte: num(p.auxilioTransporte),
    topeAuxilioTransporteSalarios: num(p.topeAuxilioTransporteSalarios),
    topeIbcSalarios: num(p.topeIbcSalarios),
    saludEmpleado: num(p.saludEmpleado),
    pensionEmpleado: num(p.pensionEmpleado),
    saludEmpleador: num(p.saludEmpleador),
    pensionEmpleador: num(p.pensionEmpleador),
    cajaCompensacion: num(p.cajaCompensacion),
    icbf: num(p.icbf),
    sena: num(p.sena),
    umbralParafiscales: p.umbralParafiscales,
    solidaridadUmbralSalarios: num(p.solidaridadUmbralSalarios),
  };
}

async function cargarMapaCuentas(conceptos: string[], empresaId: string): Promise<Map<string, number>> {
  const filas = await prisma.parametroCuentaNomina.findMany({ where: { concepto: { in: conceptos }, empresaId } });
  const mapa = new Map<string, number>();
  for (const f of filas) mapa.set(f.concepto, f.cuentaId);
  const ids = [...new Set(mapa.values())];
  const cuentas = await prisma.cuenta.findMany({ where: { id: { in: ids }, OR: [{ empresaId: null }, { empresaId }] } });
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  for (const [concepto, cuentaId] of mapa) {
    const c = porId.get(cuentaId);
    if (!c) throw new Error(`No existe la cuenta ${cuentaId} para el concepto ${concepto}`);
    if (!c.activa || !c.permiteMovimiento) {
      throw new Error(`La cuenta ${c.codigo} (${c.nombre}) debe estar activa y permitir movimiento para el concepto ${concepto}`);
    }
  }
  return mapa;
}

function serializarParametro(p: {
  anio: number; smmlv: Prisma.Decimal; auxilioTransporte: Prisma.Decimal; topeAuxilioTransporteSalarios: Prisma.Decimal;
  topeIbcSalarios: Prisma.Decimal; saludEmpleado: Prisma.Decimal; pensionEmpleado: Prisma.Decimal;
  saludEmpleador: Prisma.Decimal; pensionEmpleador: Prisma.Decimal; arlEmpleador: Prisma.Decimal;
  cajaCompensacion: Prisma.Decimal; icbf: Prisma.Decimal; sena: Prisma.Decimal; umbralParafiscales: number;
  solidaridadUmbralSalarios: Prisma.Decimal; interesesCesantias: Prisma.Decimal;
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
  };
}

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
});

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

const ajusteSchema = z.object({
  empleadoId: z.string().uuid(),
  diasTrabajados: z.number().int().min(1).max(31).optional(),
  horasExtras: z.number().min(0).optional(),
  comisiones: z.number().min(0).optional(),
  bonificaciones: z.number().min(0).optional(),
  otrosDevengados: z.number().min(0).optional(),
  retefuente: z.number().min(0).optional(),
  libranzas: z.number().min(0).optional(),
  embargos: z.number().min(0).optional(),
  otrosDescuentos: z.number().min(0).optional(),
});

const liquidarSchema = z.object({
  ajustes: z.array(ajusteSchema).default([]),
});

export async function liquidar(req: Request, res: Response): Promise<void> {
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
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    res.status(400).json({ error: "El periodo está cerrado" });
    return;
  }
  const anio = periodo.fechaFin.getFullYear();
  const parametros =
    (await prisma.parametroNomina.findUnique({ where: { empresaId_anio: { empresaId: req.empresaId!, anio } } })) ??
    (await prisma.parametroNomina.findFirst({ where: { anio, empresaId: null } }));
  if (!parametros) {
    res.status(400).json({ error: `No hay parámetros de nómina configurados para el año ${anio}` });
    return;
  }

  const contabilizadas = await prisma.nomina.count({ where: { periodoId, estado: EstadoNomina.CONTABILIZADO } });
  if (contabilizadas > 0) {
    res.status(400).json({ error: "La nómina del periodo ya está contabilizada; anule el comprobante para reliquidar" });
    return;
  }

  const parsed = liquidarSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }

  const empleados = await prisma.empleado.findMany({
    where: { activo: true, tercero: { empresaId: req.empresaId } },
    orderBy: { createdAt: "asc" },
  });
  if (empleados.length === 0) {
    res.status(400).json({ error: "No hay empleados activos para liquidar" });
    return;
  }
  const porId = new Map(empleados.map((e) => [e.id, e]));
  const ajustesPorId = new Map(parsed.data.ajustes.map((a) => [a.empleadoId, a]));
  for (const a of parsed.data.ajustes) {
    if (!porId.has(a.empleadoId)) {
      res.status(400).json({ error: `El empleado ${a.empleadoId} no existe o no está activo` });
      return;
    }
  }

  const p = parametrosCalculo(parametros);

  const creadas = await prisma.$transaction(async (tx) => {
    await tx.nomina.deleteMany({ where: { periodoId, estado: { not: EstadoNomina.CONTABILIZADO } } });
    const creadas: NominaConRel[] = [];
    for (const e of empleados) {
      const ajuste = ajustesPorId.get(e.id) ?? ({} as z.infer<typeof ajusteSchema>);
      const r = liquidarEmpleado(p, {
        salarioBase: num(e.salarioBase),
        arlEmpleador: num(e.arlEmpleador),
        ibcAjuste: num(e.ibcAjuste),
        auxilioTransporteManual: e.auxilioTransporteManual,
        numEmpleadosActivos: empleados.length,
        diasTrabajados: ajuste.diasTrabajados ?? 30,
        horasExtras: ajuste.horasExtras ?? 0,
        comisiones: ajuste.comisiones ?? 0,
        bonificaciones: ajuste.bonificaciones ?? 0,
        otrosDevengados: ajuste.otrosDevengados ?? 0,
        retefuente: ajuste.retefuente ?? 0,
        libranzas: ajuste.libranzas ?? 0,
        embargos: ajuste.embargos ?? 0,
        otrosDescuentos: ajuste.otrosDescuentos ?? 0,
      });
      const n = await tx.nomina.create({
        data: {
          empleadoId: e.id,
          periodoId,
          diasTrabajados: r.diasTrabajados,
          sueldo: new Prisma.Decimal(r.sueldo),
          horasExtras: new Prisma.Decimal(r.horasExtras),
          comisiones: new Prisma.Decimal(r.comisiones),
          bonificaciones: new Prisma.Decimal(r.bonificaciones),
          auxilioTransporte: new Prisma.Decimal(r.auxilioTransporte),
          otrosDevengados: new Prisma.Decimal(r.otrosDevengados),
          saludEmpleado: new Prisma.Decimal(r.saludEmpleado),
          pensionEmpleado: new Prisma.Decimal(r.pensionEmpleado),
          solidaridad: new Prisma.Decimal(r.solidaridad),
          retefuente: new Prisma.Decimal(r.retefuente),
          libranzas: new Prisma.Decimal(r.libranzas),
          embargos: new Prisma.Decimal(r.embargos),
          otrosDescuentos: new Prisma.Decimal(r.otrosDescuentos),
          ibc: new Prisma.Decimal(r.ibc),
          aporteSalud: new Prisma.Decimal(r.aporteSalud),
          aportePension: new Prisma.Decimal(r.aportePension),
          aporteArl: new Prisma.Decimal(r.aporteArl),
          aporteCaja: new Prisma.Decimal(r.aporteCaja),
          aporteIcbf: new Prisma.Decimal(r.aporteIcbf),
          aporteSena: new Prisma.Decimal(r.aporteSena),
          totalDevengado: new Prisma.Decimal(r.totalDevengado),
          totalDeducciones: new Prisma.Decimal(r.totalDeducciones),
          netoPagar: new Prisma.Decimal(r.netoPagar),
          estado: EstadoNomina.BORRADOR,
        },
        include: INCLUDE_NOMINA,
      });
      creadas.push(n);
    }
    await registrarAuditoria(tx, {
      usuarioId: req.user!.sub,
      empresaId: req.empresaId,
      accion: AccionAuditoria.LIQUIDAR_NOMINA,
      entidad: "Periodo",
      entidadId: periodoId,
      detalle: { periodo: periodo.nombre, empleados: empleados.length },
    });
    return creadas;
  });

  res.status(201).json({
    periodo: periodo.nombre,
    empleados: creadas.length,
    lineas: creadas.map((n) => serializarLinea(n)),
    totales: calcularTotales(creadas),
  });
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
  const lineas = await prisma.nomina.findMany({ where: { periodoId }, orderBy: { empleado: { createdAt: "asc" } }, include: INCLUDE_NOMINA });
  if (lineas.length === 0) {
    res.status(400).json({ error: "No hay nómina liquidada para este periodo" });
    return;
  }
  if (lineas.some((l) => l.estado === EstadoNomina.CONTABILIZADO)) {
    res.status(400).json({ error: "La nómina del periodo ya está contabilizada" });
    return;
  }
  if (lineas.some((l) => l.estado === EstadoNomina.ANULADO)) {
    res.status(400).json({ error: "Hay liquidaciones anuladas; vuelva a liquidar el periodo" });
    return;
  }

  let mapa: Map<string, number>;
  try {
    mapa = await cargarMapaCuentas(CONCEPTOS_NOMINA, empresaId);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }
  const asientos = asientosDeNomina(lineas.map((l) => aContable(l)), mapa);
  if (asientos.length < 2) {
    res.status(400).json({ error: "El asiento de nómina no tiene movimientos" });
    return;
  }

  const usuarioId = req.user!.sub;
  const resultado = await prisma.$transaction(async (tx) => {
    const comprobante = await crearComprobanteDiario(tx, {
      empresaId,
      periodoId,
      fecha: periodo.fechaFin,
      concepto: `Nómina periodo ${periodo.nombre}`,
      usuarioId,
      asientos,
    });
    await tx.nomina.updateMany({ where: { periodoId }, data: { estado: EstadoNomina.CONTABILIZADO, comprobanteId: comprobante.id } });
    await registrarAuditoria(tx, {
      usuarioId,
      empresaId,
      accion: AccionAuditoria.CONTABILIZAR_NOMINA,
      entidad: "Periodo",
      entidadId: periodoId,
      detalle: { periodo: periodo.nombre, consecutivo: comprobante.consecutivo, comprobanteId: comprobante.id },
    });
    await marcarActividadProceso(tx, empresaId, periodo.fechaFin.getFullYear(), TipoActividadProceso.NOMINA);
    return comprobante;
  });

  res.status(201).json({
    comprobante: {
      id: resultado.id,
      consecutivo: resultado.consecutivo,
      fecha: resultado.fecha.toISOString().slice(0, 10),
      concepto: resultado.concepto,
      totalDebito: num(resultado.totalDebito),
      totalCredito: num(resultado.totalCredito),
      numAsientos: resultado.asientos.length,
      asientos: resultado.asientos.map((a) => ({
        codigoCuenta: (a as { cuenta?: { codigo: string } }).cuenta?.codigo,
        debito: num(a.debito),
        credito: num(a.credito),
        detalle: a.detalle,
      })),
    },
    totales: calcularTotales(lineas),
  });
}

// ---------------- Provisión de prestaciones ----------------

export async function provisionar(req: Request, res: Response): Promise<void> {
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
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    res.status(400).json({ error: "El periodo está cerrado" });
    return;
  }
  const anio = periodo.fechaFin.getFullYear();
  const parametros =
    (await prisma.parametroNomina.findUnique({ where: { empresaId_anio: { empresaId: req.empresaId!, anio } } })) ??
    (await prisma.parametroNomina.findFirst({ where: { anio, empresaId: null } }));
  if (!parametros) {
    res.status(400).json({ error: `No hay parámetros de nómina configurados para el año ${anio}` });
    return;
  }

  const lineas = await prisma.nomina.findMany({ where: { periodoId, estado: EstadoNomina.CONTABILIZADO }, orderBy: { empleado: { createdAt: "asc" } }, include: INCLUDE_NOMINA });
  if (lineas.length === 0) {
    res.status(400).json({ error: "Debe contabilizar la nómina del periodo antes de provisionar" });
    return;
  }

  const existentes = await prisma.provisionNomina.findMany({
    where: { periodoId },
    include: { comprobante: { select: { estado: true } } },
  });
  const vigentes = existentes.filter((p) => p.comprobanteId !== null && p.comprobante?.estado !== "ANULADO");
  if (vigentes.length > 0) {
    res.status(400).json({ error: "La provisión de prestaciones del periodo ya fue calculada; anule el comprobante para recalcular" });
    return;
  }

  const intereses = num(parametros.interesesCesantias);
  const provisiones = lineas.map((l) => provisionarEmpleado(aContable(l), intereses));

  let mapa: Map<string, number>;
  try {
    mapa = await cargarMapaCuentas(CONCEPTOS_PROVISION, req.empresaId!);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }
  const asientos = asientosDeProvision(
    provisiones.map((p) => ({ cesantias: p.cesantias, interesesCesantias: p.interesesCesantias, prima: p.prima, vacaciones: p.vacaciones })),
    mapa
  );

  const usuarioId = req.user!.sub;
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.provisionNomina.deleteMany({ where: { periodoId } });
    const comprobante = await crearComprobanteDiario(tx, {
      empresaId: req.empresaId!,
      periodoId,
      fecha: periodo.fechaFin,
      concepto: `Provisión de prestaciones ${periodo.nombre}`,
      usuarioId,
      asientos,
    });
    const creadas = [];
    for (let i = 0; i < lineas.length; i++) {
      const p = provisiones[i];
      creadas.push(
        await tx.provisionNomina.create({
          data: {
            empleadoId: lineas[i].empleadoId,
            periodoId,
            baseCesantias: new Prisma.Decimal(p.baseCesantias),
            cesantias: new Prisma.Decimal(p.cesantias),
            interesesCesantias: new Prisma.Decimal(p.interesesCesantias),
            prima: new Prisma.Decimal(p.prima),
            baseVacaciones: new Prisma.Decimal(p.baseVacaciones),
            vacaciones: new Prisma.Decimal(p.vacaciones),
            total: new Prisma.Decimal(p.total),
            comprobanteId: comprobante.id,
          },
        })
      );
    }
    await registrarAuditoria(tx, {
      usuarioId,
      empresaId: req.empresaId,
      accion: AccionAuditoria.PROVISIONAR_NOMINA,
      entidad: "Periodo",
      entidadId: periodoId,
      detalle: { periodo: periodo.nombre, empleados: creadas.length, consecutivo: comprobante.consecutivo },
    });
    return { comprobante, creadas };
  });

  res.status(201).json({
    comprobante: {
      id: resultado.comprobante.id,
      consecutivo: resultado.comprobante.consecutivo,
      fecha: resultado.comprobante.fecha.toISOString().slice(0, 10),
      concepto: resultado.comprobante.concepto,
      totalDebito: num(resultado.comprobante.totalDebito),
      totalCredito: num(resultado.comprobante.totalCredito),
      numAsientos: resultado.comprobante.asientos.length,
      asientos: resultado.comprobante.asientos.map((a) => ({
        codigoCuenta: (a as { cuenta?: { codigo: string } }).cuenta?.codigo,
        debito: num(a.debito),
        credito: num(a.credito),
        detalle: a.detalle,
      })),
    },
    total: provisiones.reduce((s, p) => s + p.total, 0),
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

export const nomina = { obtenerParametros, actualizarParametros, obtenerParametrosCuentas, actualizarParametrosCuentas, liquidar, obtenerLiquidacion, contabilizar, provisionar, obtenerProvision };
