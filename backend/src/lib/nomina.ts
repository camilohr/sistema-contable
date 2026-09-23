import { z } from "zod";
import { Prisma, EstadoPeriodo, EstadoNomina, EstadoComprobante, TipoActividadProceso, AccionAuditoria } from "@prisma/client";
import { prisma } from "./prisma.js";
import { registrarAuditoria } from "./auditoria.js";
import { crearComprobanteDiario } from "./comprobantes.js";
import { marcarActividadProceso } from "./procesos.js";
import { num, redondear2 } from "./decimal.js";
export { redondear2 };

export interface ParametrosNominaCalculo {
  smmlv: number;
  auxilioTransporte: number;
  topeAuxilioTransporteSalarios: number;
  topeIbcSalarios: number;
  saludEmpleado: number;
  pensionEmpleado: number;
  saludEmpleador: number;
  pensionEmpleador: number;
  cajaCompensacion: number;
  icbf: number;
  sena: number;
  umbralParafiscales: number;
  solidaridadUmbralSalarios: number;
}

export interface EmpleadoLiquidacionInput {
  salarioBase: number;
  arlEmpleador: number;
  ibcAjuste: number;
  auxilioTransporteManual: boolean;
  numEmpleadosActivos: number;
  diasTrabajados: number;
  horasExtras: number;
  comisiones: number;
  bonificaciones: number;
  otrosDevengados: number;
  retefuente: number;
  libranzas: number;
  embargos: number;
  otrosDescuentos: number;
}

export interface LiquidacionResultado {
  diasTrabajados: number;
  sueldo: number;
  horasExtras: number;
  comisiones: number;
  bonificaciones: number;
  auxilioTransporte: number;
  otrosDevengados: number;
  ibc: number;
  saludEmpleado: number;
  pensionEmpleado: number;
  solidaridad: number;
  retefuente: number;
  libranzas: number;
  embargos: number;
  otrosDescuentos: number;
  totalDevengado: number;
  totalDeducciones: number;
  netoPagar: number;
  aporteSalud: number;
  aportePension: number;
  aporteArl: number;
  aporteCaja: number;
  aporteIcbf: number;
  aporteSena: number;
}

/**
 * Liquida la nómina mensual de un empleado según las reglas del módulo 9
 * (docs/diseno-nomina.md). Devuelve valores redondeados a 2 decimales.
 */
export function liquidarEmpleado(p: ParametrosNominaCalculo, e: EmpleadoLiquidacionInput): LiquidacionResultado {
  const sueldo = redondear2((e.salarioBase * e.diasTrabajados) / 30);
  const horasExtras = redondear2(e.horasExtras);
  const comisiones = redondear2(e.comisiones);
  const bonificaciones = redondear2(e.bonificaciones);
  const otrosDevengados = redondear2(e.otrosDevengados);

  const topeIbc = redondear2(p.topeIbcSalarios * p.smmlv);
  const ibc = redondear2(Math.min(sueldo + horasExtras + comisiones + bonificaciones + e.ibcAjuste, topeIbc));

  const aplicaAuxilio = e.auxilioTransporteManual || e.salarioBase <= redondear2(p.topeAuxilioTransporteSalarios * p.smmlv);
  const auxilioTransporte = aplicaAuxilio ? redondear2((p.auxilioTransporte * e.diasTrabajados) / 30) : 0;

  // Porcentajes sobre el IBC: base*pct es el valor en centavos; se redondea
  // con Math.round para evitar el drift de punto flotante (p. ej. x.925).
  const porcentaje = (base: number, pct: number): number => Math.round(base * pct) / 100;

  const saludEmpleado = porcentaje(ibc, p.saludEmpleado);
  const pensionEmpleado = porcentaje(ibc, p.pensionEmpleado);
  const solidaridad = ibc > redondear2(p.solidaridadUmbralSalarios * p.smmlv) ? porcentaje(ibc, 1) : 0;

  const retefuente = redondear2(e.retefuente);
  const libranzas = redondear2(e.libranzas);
  const embargos = redondear2(e.embargos);
  const otrosDescuentos = redondear2(e.otrosDescuentos);

  const totalDevengado = redondear2(sueldo + horasExtras + comisiones + bonificaciones + otrosDevengados + auxilioTransporte);
  const totalDeducciones = redondear2(saludEmpleado + pensionEmpleado + solidaridad + retefuente + libranzas + embargos + otrosDescuentos);
  const netoPagar = redondear2(totalDevengado - totalDeducciones);

  const aplicaParafiscales = e.numEmpleadosActivos >= p.umbralParafiscales;
  const aporteSalud = porcentaje(ibc, p.saludEmpleador);
  const aportePension = porcentaje(ibc, p.pensionEmpleador);
  const aporteArl = porcentaje(ibc, e.arlEmpleador);
  const aporteCaja = porcentaje(ibc, p.cajaCompensacion);
  const aporteIcbf = aplicaParafiscales ? porcentaje(ibc, p.icbf) : 0;
  const aporteSena = aplicaParafiscales ? porcentaje(ibc, p.sena) : 0;

  return {
    diasTrabajados: e.diasTrabajados,
    sueldo,
    horasExtras,
    comisiones,
    bonificaciones,
    auxilioTransporte,
    otrosDevengados,
    ibc,
    saludEmpleado,
    pensionEmpleado,
    solidaridad,
    retefuente,
    libranzas,
    embargos,
    otrosDescuentos,
    totalDevengado,
    totalDeducciones,
    netoPagar,
    aporteSalud,
    aportePension,
    aporteArl,
    aporteCaja,
    aporteIcbf,
    aporteSena,
  };
}

export interface ProvisionResultado {
  baseCesantias: number;
  cesantias: number;
  interesesCesantias: number;
  prima: number;
  baseVacaciones: number;
  vacaciones: number;
  total: number;
}

/**
 * Provisión mensual de prestaciones sociales. Los porcentajes de cesantías,
 * prima y vacaciones se toman de `ParametroNomina` (por defecto 8.33/8.33/4.17
 * que equivalen a 1/12, 1/12 y 1/24). Solo el porcentaje anual de intereses
 * de cesantías es parametrizable (como ya lo era).
 */
export function provisionarEmpleado(
  l: { sueldo: number; auxilioTransporte: number },
  interesesCesantiasAnual: number,
  tasas?: { cesantias?: number; prima?: number; vacaciones?: number }
): ProvisionResultado {
  const pctCesantias = tasas?.cesantias ?? 8.33;
  const pctPrima = tasas?.prima ?? 8.33;
  const pctVacaciones = tasas?.vacaciones ?? 4.17;
  const baseCesantias = redondear2(l.sueldo + l.auxilioTransporte);
  const cesantias = redondear2((baseCesantias * pctCesantias) / 100);
  const interesesCesantias = redondear2((cesantias * interesesCesantiasAnual) / 100 / 12);
  const prima = redondear2((baseCesantias * pctPrima) / 100);
  const baseVacaciones = redondear2(l.sueldo);
  const vacaciones = redondear2((baseVacaciones * pctVacaciones) / 100);
  const total = redondear2(cesantias + interesesCesantias + prima + vacaciones);
  return { baseCesantias, cesantias, interesesCesantias, prima, baseVacaciones, vacaciones, total };
}

export interface AsientoNomina {
  cuentaId: number;
  debito: number;
  credito: number;
  detalle: string;
}

export type LineaNominaContable = Omit<LiquidacionResultado, "diasTrabajados">;

const CONCEPTOS_GASTO = new Set([
  "SUELDO",
  "HORAS_EXTRAS",
  "COMISIONES",
  "BONIFICACIONES",
  "OTROS_DEVENGADOS",
  "AUXILIO_TRANSPORTE",
  "SALUD_GASTO",
  "PENSION_GASTO",
  "ARL_GASTO",
  "CAJA_GASTO",
  "ICBF_GASTO",
  "SENA_GASTO",
]);

/**
 * Construye los asientos agregados del comprobante de nómina del periodo.
 * La partida doble cuadra exactamente: cada empleado aporta el mismo valor a
 * los débitos (devengados + aportes patronales) y a los créditos (neto +
 * deducciones + aportes).
 */
export function asientosDeNomina(lineas: LineaNominaContable[], cuentaPorConcepto: Map<string, number>): AsientoNomina[] {
  const suma = (get: (l: LineaNominaContable) => number): number => redondear2(lineas.reduce((s, l) => s + get(l), 0));

  const grupos: Array<{ concepto: string; valor: number; detalle: string }> = [
    { concepto: "SUELDO", valor: suma((l) => l.sueldo), detalle: "Sueldos" },
    { concepto: "HORAS_EXTRAS", valor: suma((l) => l.horasExtras), detalle: "Horas extras y recargos" },
    { concepto: "COMISIONES", valor: suma((l) => l.comisiones), detalle: "Comisiones" },
    { concepto: "BONIFICACIONES", valor: suma((l) => l.bonificaciones), detalle: "Bonificaciones" },
    { concepto: "OTROS_DEVENGADOS", valor: suma((l) => l.otrosDevengados), detalle: "Otros devengados" },
    { concepto: "AUXILIO_TRANSPORTE", valor: suma((l) => l.auxilioTransporte), detalle: "Auxilio de transporte" },
    { concepto: "SALUD_GASTO", valor: suma((l) => l.aporteSalud), detalle: "Aportes a EPS" },
    { concepto: "PENSION_GASTO", valor: suma((l) => l.aportePension), detalle: "Aportes a pensiones" },
    { concepto: "ARL_GASTO", valor: suma((l) => l.aporteArl), detalle: "Aportes a ARL" },
    { concepto: "CAJA_GASTO", valor: suma((l) => l.aporteCaja), detalle: "Aportes a cajas de compensación" },
    { concepto: "ICBF_GASTO", valor: suma((l) => l.aporteIcbf), detalle: "Aportes al ICBF" },
    { concepto: "SENA_GASTO", valor: suma((l) => l.aporteSena), detalle: "Aportes SENA" },
    { concepto: "NETO_POR_PAGAR", valor: suma((l) => l.netoPagar), detalle: "Neto por pagar" },
    { concepto: "SALUD_PASIVO", valor: suma((l) => l.saludEmpleado + l.aporteSalud), detalle: "Aportes a EPS" },
    { concepto: "PENSION_PASIVO", valor: suma((l) => l.pensionEmpleado + l.aportePension), detalle: "Aportes a pensiones" },
    { concepto: "ARL_PASIVO", valor: suma((l) => l.aporteArl), detalle: "Aportes a ARL" },
    { concepto: "CAJA_PASIVO", valor: suma((l) => l.aporteCaja), detalle: "Aportes a cajas de compensación" },
    { concepto: "ICBF_PASIVO", valor: suma((l) => l.aporteIcbf), detalle: "Aportes al ICBF" },
    { concepto: "SENA_PASIVO", valor: suma((l) => l.aporteSena), detalle: "Aportes SENA" },
    { concepto: "SOLIDARIDAD", valor: suma((l) => l.solidaridad), detalle: "Fondo de solidaridad pensional" },
    { concepto: "RETEFUENTE", valor: suma((l) => l.retefuente), detalle: "Retención en la fuente" },
    { concepto: "LIBRANZAS", valor: suma((l) => l.libranzas), detalle: "Libranzas" },
    { concepto: "EMBARGOS", valor: suma((l) => l.embargos), detalle: "Embargos judiciales" },
    { concepto: "OTROS_DESCUENTOS", valor: suma((l) => l.otrosDescuentos), detalle: "Otros descuentos" },
  ];

  const asientos: AsientoNomina[] = [];
  for (const { concepto, valor, detalle } of grupos) {
    if (valor <= 0) continue;
    const cuentaId = cuentaPorConcepto.get(concepto);
    if (!cuentaId) throw new Error(`No hay cuenta configurada para el concepto ${concepto}`);
    const esGasto = CONCEPTOS_GASTO.has(concepto);
    asientos.push({
      cuentaId,
      debito: esGasto ? valor : 0,
      credito: esGasto ? 0 : valor,
      detalle: `${detalle} — nómina`,
    });
  }
  return asientos;
}

export interface LineaProvisionContable {
  cesantias: number;
  interesesCesantias: number;
  prima: number;
  vacaciones: number;
}

/**
 * Asientos del comprobante de provisión de prestaciones del periodo
 * (510535 por concepto con crédito al pasivo de cada prestación).
 */
export function asientosDeProvision(lineas: LineaProvisionContable[], cuentaPorConcepto: Map<string, number>): AsientoNomina[] {
  const suma = (get: (l: LineaProvisionContable) => number): number => redondear2(lineas.reduce((s, l) => s + get(l), 0));

  const gasto: Array<{ concepto: string; valor: number; detalle: string }> = [
    { concepto: "CESANTIAS_GASTO", valor: suma((l) => l.cesantias), detalle: "Cesantías" },
    { concepto: "INTERESES_CESANTIAS_GASTO", valor: suma((l) => l.interesesCesantias), detalle: "Intereses sobre cesantías" },
    { concepto: "PRIMA_GASTO", valor: suma((l) => l.prima), detalle: "Prima de servicios" },
    { concepto: "VACACIONES_GASTO", valor: suma((l) => l.vacaciones), detalle: "Vacaciones" },
  ];
  const pasivo: Array<{ concepto: string; valor: number; detalle: string }> = [
    { concepto: "CESANTIAS_PASIVO", valor: suma((l) => l.cesantias), detalle: "Cesantías consolidadas" },
    { concepto: "INTERESES_CESANTIAS_PASIVO", valor: suma((l) => l.interesesCesantias), detalle: "Intereses sobre cesantías" },
    { concepto: "PRIMA_PASIVO", valor: suma((l) => l.prima), detalle: "Prima de servicios" },
    { concepto: "VACACIONES_PASIVO", valor: suma((l) => l.vacaciones), detalle: "Vacaciones consolidadas" },
  ];

  const asientos: AsientoNomina[] = [];
  for (const { concepto, valor, detalle } of gasto) {
    if (valor <= 0) continue;
    const cuentaId = cuentaPorConcepto.get(concepto);
    if (!cuentaId) throw new Error(`No hay cuenta configurada para el concepto ${concepto}`);
    asientos.push({ cuentaId, debito: valor, credito: 0, detalle: `${detalle} — provisión` });
  }
  for (const { concepto, valor, detalle } of pasivo) {
    if (valor <= 0) continue;
    const cuentaId = cuentaPorConcepto.get(concepto);
    if (!cuentaId) throw new Error(`No hay cuenta configurada para el concepto ${concepto}`);
    asientos.push({ cuentaId, debito: 0, credito: valor, detalle: `${detalle} — provisión` });
  }
  return asientos;
}

export interface RespuestaHttp {
  status: number;
  body: object;
}

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

export async function liquidarOrquestado(args: {
  empresaId: string;
  usuarioId: string;
  periodoId: number;
  body: unknown;
}): Promise<RespuestaHttp> {
  const { empresaId, usuarioId, periodoId, body } = args;
  if (!Number.isInteger(periodoId)) {
    return { status: 400, body: { error: "Periodo inválido" } };
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) {
    return { status: 404, body: { error: `No existe el periodo ${periodoId}` } };
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    return { status: 400, body: { error: "El periodo está cerrado" } };
  }
  const anio = periodo.fechaFin.getFullYear();
  const parametros =
    (await prisma.parametroNomina.findUnique({ where: { empresaId_anio: { empresaId, anio } } })) ??
    (await prisma.parametroNomina.findFirst({ where: { anio, empresaId: null } }));
  if (!parametros) {
    return { status: 400, body: { error: `No hay parámetros de nómina configurados para el año ${anio}` } };
  }

  const contabilizadas = await prisma.nomina.count({ where: { periodoId, estado: EstadoNomina.CONTABILIZADO } });
  if (contabilizadas > 0) {
    return { status: 400, body: { error: "La nómina del periodo ya está contabilizada; anule el comprobante para reliquidar" } };
  }

  const parsed = liquidarSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return { status: 400, body: { error: "Datos inválidos", detalle: parsed.error.flatten() } };
  }

  const empleados = await prisma.empleado.findMany({
    where: { activo: true, tercero: { empresaId } },
    orderBy: { createdAt: "asc" },
  });
  if (empleados.length === 0) {
    return { status: 400, body: { error: "No hay empleados activos para liquidar" } };
  }
  const porId = new Map(empleados.map((e) => [e.id, e]));
  const ajustesPorId = new Map(parsed.data.ajustes.map((a) => [a.empleadoId, a]));
  for (const a of parsed.data.ajustes) {
    if (!porId.has(a.empleadoId)) {
      return { status: 400, body: { error: `El empleado ${a.empleadoId} no existe o no está activo` } };
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
      usuarioId,
      empresaId,
      accion: AccionAuditoria.LIQUIDAR_NOMINA,
      entidad: "Periodo",
      entidadId: periodoId,
      detalle: { periodo: periodo.nombre, empleados: empleados.length },
    });
    return creadas;
  });

  return {
    status: 201,
    body: {
      periodo: periodo.nombre,
      empleados: creadas.length,
      lineas: creadas.map((n) => serializarLinea(n)),
      totales: calcularTotales(creadas),
    },
  };
}

export async function contabilizarOrquestado(args: {
  empresaId?: string;
  usuarioId: string;
  periodoId: number;
}): Promise<RespuestaHttp> {
  const { empresaId, usuarioId, periodoId } = args;
  if (!empresaId) {
    return { status: 403, body: { error: "Empresa no seleccionada" } };
  }
  if (!Number.isInteger(periodoId)) {
    return { status: 400, body: { error: "Periodo inválido" } };
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) {
    return { status: 404, body: { error: `No existe el periodo ${periodoId}` } };
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    return { status: 400, body: { error: "El periodo está cerrado" } };
  }
  const lineas = await prisma.nomina.findMany({ where: { periodoId }, orderBy: { empleado: { createdAt: "asc" } }, include: INCLUDE_NOMINA });
  if (lineas.length === 0) {
    return { status: 400, body: { error: "No hay nómina liquidada para este periodo" } };
  }
  if (lineas.some((l) => l.estado === EstadoNomina.CONTABILIZADO)) {
    return { status: 400, body: { error: "La nómina del periodo ya está contabilizada" } };
  }
  if (lineas.some((l) => l.estado === EstadoNomina.ANULADO)) {
    return { status: 400, body: { error: "Hay liquidaciones anuladas; vuelva a liquidar el periodo" } };
  }

  let mapa: Map<string, number>;
  try {
    mapa = await cargarMapaCuentas(CONCEPTOS_NOMINA, empresaId);
  } catch (err) {
    return { status: 400, body: { error: (err as Error).message } };
  }
  const asientos = asientosDeNomina(lineas.map((l) => aContable(l)), mapa);
  if (asientos.length < 2) {
    return { status: 400, body: { error: "El asiento de nómina no tiene movimientos" } };
  }

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

  return {
    status: 201,
    body: {
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
    },
  };
}

export async function provisionarOrquestado(args: {
  empresaId: string;
  usuarioId: string;
  periodoId: number;
}): Promise<RespuestaHttp> {
  const { empresaId, usuarioId, periodoId } = args;
  if (!Number.isInteger(periodoId)) {
    return { status: 400, body: { error: "Periodo inválido" } };
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) {
    return { status: 404, body: { error: `No existe el periodo ${periodoId}` } };
  }
  if (periodo.estado !== EstadoPeriodo.ABIERTO) {
    return { status: 400, body: { error: "El periodo está cerrado" } };
  }
  const anio = periodo.fechaFin.getFullYear();
  const parametros =
    (await prisma.parametroNomina.findUnique({ where: { empresaId_anio: { empresaId, anio } } })) ??
    (await prisma.parametroNomina.findFirst({ where: { anio, empresaId: null } }));
  if (!parametros) {
    return { status: 400, body: { error: `No hay parámetros de nómina configurados para el año ${anio}` } };
  }

  const lineas = await prisma.nomina.findMany({ where: { periodoId, estado: EstadoNomina.CONTABILIZADO }, orderBy: { empleado: { createdAt: "asc" } }, include: INCLUDE_NOMINA });
  if (lineas.length === 0) {
    return { status: 400, body: { error: "Debe contabilizar la nómina del periodo antes de provisionar" } };
  }

  const existentes = await prisma.provisionNomina.findMany({
    where: { periodoId },
    include: { comprobante: { select: { estado: true } } },
  });
  const vigentes = existentes.filter((p) => p.comprobanteId !== null && p.comprobante?.estado !== "ANULADO" && p.comprobante?.estado !== "BORRADOR");
  if (vigentes.length > 0) {
    return { status: 400, body: { error: "La provisión de prestaciones del periodo ya fue contabilizada; anule el comprobante para recalcular" } };
  }

  const intereses = num(parametros.interesesCesantias);
  const tasasPrestaciones = {
    cesantias: num(parametros.cesantias),
    prima: num(parametros.prima),
    vacaciones: num(parametros.vacaciones),
  };
  const provisiones = lineas.map((l) => provisionarEmpleado(aContable(l), intereses, tasasPrestaciones));

  let mapa: Map<string, number>;
  try {
    mapa = await cargarMapaCuentas(CONCEPTOS_PROVISION, empresaId);
  } catch (err) {
    return { status: 400, body: { error: (err as Error).message } };
  }
  const asientos = asientosDeProvision(
    provisiones.map((p) => ({ cesantias: p.cesantias, interesesCesantias: p.interesesCesantias, prima: p.prima, vacaciones: p.vacaciones })),
    mapa
  );

  const resultado = await prisma.$transaction(async (tx) => {
    const borradorAnterior = existentes.find((p) => p.comprobanteId !== null && p.comprobante?.estado === "BORRADOR");
    await tx.provisionNomina.deleteMany({ where: { periodoId } });
    if (borradorAnterior?.comprobanteId) {
      await tx.comprobante.delete({ where: { id: borradorAnterior.comprobanteId } });
    }
    const comprobante = await crearComprobanteDiario(tx, {
      empresaId,
      periodoId,
      fecha: periodo.fechaFin,
      concepto: `Provisión de prestaciones ${periodo.nombre}`,
      usuarioId,
      asientos,
      // S1-15: queda en BORRADOR hasta que un segundo revisor lo contabilice.
      estado: EstadoComprobante.BORRADOR,
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
      empresaId,
      accion: AccionAuditoria.PROVISIONAR_NOMINA,
      entidad: "Periodo",
      entidadId: periodoId,
      detalle: { periodo: periodo.nombre, empleados: creadas.length, consecutivo: comprobante.consecutivo },
    });
    return { comprobante, creadas };
  });

  return {
    status: 201,
    body: {
      comprobante: {
        id: resultado.comprobante.id,
        consecutivo: resultado.comprobante.consecutivo,
        fecha: resultado.comprobante.fecha.toISOString().slice(0, 10),
        concepto: resultado.comprobante.concepto,
        estado: resultado.comprobante.estado,
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
    },
  };
}

export { CONCEPTOS, INCLUDE_NOMINA, serializarLinea, calcularTotales };
export type { NominaConRel };
