export const redondear2 = (n: number): number => Math.round(n * 100) / 100;

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
