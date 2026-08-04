import { SaldoCuenta } from "../controllers/reportes.controller.js";

export interface DatosIndicadores {
  activoCorriente: number;
  activoNoCorriente: number;
  activoTotal: number;
  pasivoCorriente: number;
  pasivoNoCorriente: number;
  pasivoTotal: number;
  patrimonio: number;
  inventario: number;
  cartera: number;
  ingresos: number;
  ventas: number;
  costoVentas: number;
  gastos: number;
  utilidadNeta: number;
}

export interface Razones {
  razonCorriente: number | null;
  pruebaAcida: number | null;
  endeudamiento: number | null;
  margenNeto: number | null;
  rotacionCartera: number | null;
  rotacionInventario: number | null;
}

export interface VerticalFila {
  codigo: string;
  nombre: string;
  saldoDesde: number;
  pctDesde: number | null;
  saldoHasta: number;
  pctHasta: number | null;
}

export interface SeccionVertical {
  seccion: string;
  totalDesde: number;
  totalHasta: number;
  filas: VerticalFila[];
}

export interface HorizontalFila {
  seccion: string;
  nombre: string;
  desde: number;
  hasta: number;
  variacion: number;
  variacionPct: number | null;
}

// Convención PUC colombiana para corriente/no corriente (ver docs/roadmap-v1.1.md, módulo 5).
const ACTIVO_CORRIENTE = new Set(["11", "12", "13", "14"]);
const PASIVO_CORRIENTE = new Set(["21", "22", "23", "24", "25", "26"]);

const SECCIONES: { nombre: string; clases: number[] }[] = [
  { nombre: "Activo", clases: [1] },
  { nombre: "Pasivo", clases: [2] },
  { nombre: "Patrimonio", clases: [3] },
  { nombre: "Ingresos", clases: [4] },
  { nombre: "Costos", clases: [6] },
  { nombre: "Gastos", clases: [5] },
];

export function agregarDatos(saldos: SaldoCuenta[]): DatosIndicadores {
  let activoCorriente = 0;
  let activoNoCorriente = 0;
  let pasivoCorriente = 0;
  let pasivoNoCorriente = 0;
  let patrimonio = 0;
  let inventario = 0;
  let cartera = 0;
  let ingresos = 0;
  let ventas = 0;
  let costoVentas = 0;
  let gastos = 0;

  for (const c of saldos) {
    switch (c.clase) {
      case 1:
        if (c.grupo === "14") inventario += c.saldo;
        if (c.grupo === "13") cartera += c.saldo;
        if (ACTIVO_CORRIENTE.has(c.grupo)) activoCorriente += c.saldo;
        else activoNoCorriente += c.saldo;
        break;
      case 2:
        if (PASIVO_CORRIENTE.has(c.grupo)) pasivoCorriente += c.saldo;
        else pasivoNoCorriente += c.saldo;
        break;
      case 3:
        patrimonio += c.saldo;
        break;
      case 4:
        ingresos += c.saldo;
        if (c.grupo === "41") ventas += c.saldo;
        break;
      case 5:
        gastos += c.saldo;
        break;
      case 6:
        costoVentas += c.saldo;
        break;
    }
  }

  return {
    activoCorriente,
    activoNoCorriente,
    activoTotal: activoCorriente + activoNoCorriente,
    pasivoCorriente,
    pasivoNoCorriente,
    pasivoTotal: pasivoCorriente + pasivoNoCorriente,
    patrimonio,
    inventario,
    cartera,
    ingresos,
    ventas,
    costoVentas,
    gastos,
    utilidadNeta: ingresos - costoVentas - gastos,
  };
}

const div = (a: number, b: number): number | null => (b === 0 ? null : a / b);

export function calcularRazones(
  d: DatosIndicadores,
  promedios?: { carteraPromedio?: number; inventarioPromedio?: number },
): Razones {
  const cartera = promedios?.carteraPromedio ?? d.cartera;
  const inventario = promedios?.inventarioPromedio ?? d.inventario;
  return {
    razonCorriente: div(d.activoCorriente, d.pasivoCorriente),
    pruebaAcida: div(d.activoCorriente - d.inventario, d.pasivoCorriente),
    endeudamiento: div(d.pasivoTotal, d.activoTotal),
    margenNeto: div(d.utilidadNeta, d.ingresos),
    rotacionCartera: div(d.ventas, cartera),
    rotacionInventario: div(d.costoVentas, inventario),
  };
}

function filtrarPorClase(saldos: SaldoCuenta[], clases: number[]): SaldoCuenta[] {
  return saldos.filter((c) => clases.includes(c.clase));
}

const totalSeccion = (saldos: SaldoCuenta[]) => saldos.reduce((s, c) => s + c.saldo, 0);

export function utilidad(saldos: SaldoCuenta[]): number {
  return agregarDatos(saldos).utilidadNeta;
}

export function analisisVertical(saldosDesde: SaldoCuenta[], saldosHasta: SaldoCuenta[]): SeccionVertical[] {
  return SECCIONES.map(({ nombre, clases }) => {
    const desde = filtrarPorClase(saldosDesde, clases);
    const hasta = filtrarPorClase(saldosHasta, clases);
    const totalDesde = totalSeccion(desde);
    const totalHasta = totalSeccion(hasta);
    const codigos = new Set<string>();
    for (const c of desde) codigos.add(c.codigo);
    for (const c of hasta) codigos.add(c.codigo);

    const filas: VerticalFila[] = [...codigos]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((codigo) => {
        const a = desde.find((c) => c.codigo === codigo);
        const b = hasta.find((c) => c.codigo === codigo);
        return {
          codigo,
          nombre: (a ?? b)!.nombre,
          saldoDesde: a?.saldo ?? 0,
          pctDesde: totalDesde === 0 ? null : ((a?.saldo ?? 0) / totalDesde) * 100,
          saldoHasta: b?.saldo ?? 0,
          pctHasta: totalHasta === 0 ? null : ((b?.saldo ?? 0) / totalHasta) * 100,
        };
      });

    return { seccion: nombre, totalDesde, totalHasta, filas };
  }).filter((s) => s.filas.length > 0);
}

export function analisisHorizontal(saldosDesde: SaldoCuenta[], saldosHasta: SaldoCuenta[]): HorizontalFila[] {
  const filas: HorizontalFila[] = [];

  for (const { nombre, clases } of SECCIONES) {
    const desde = filtrarPorClase(saldosDesde, clases);
    const hasta = filtrarPorClase(saldosHasta, clases);
    const totalDesde = totalSeccion(desde);
    const totalHasta = totalSeccion(hasta);
    if (totalDesde === 0 && totalHasta === 0) continue;

    filas.push(filaHorizontal(`${nombre} (total)`, totalDesde, totalHasta, nombre));

    const codigos = new Set<string>();
    for (const c of desde) codigos.add(c.codigo);
    for (const c of hasta) codigos.add(c.codigo);
    for (const codigo of [...codigos].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      const a = desde.find((c) => c.codigo === codigo);
      const b = hasta.find((c) => c.codigo === codigo);
      const vDesde = a?.saldo ?? 0;
      const vHasta = b?.saldo ?? 0;
      if (vDesde === 0 && vHasta === 0) continue;
      filas.push(filaHorizontal((a ?? b)!.nombre, vDesde, vHasta, nombre));
    }
  }

  const uDesde = utilidad(saldosDesde);
  const uHasta = utilidad(saldosHasta);
  if (uDesde !== 0 || uHasta !== 0) {
    filas.push(filaHorizontal("Utilidad del ejercicio", uDesde, uHasta, "Resultado"));
  }

  return filas;
}

function filaHorizontal(nombre: string, desde: number, hasta: number, seccion: string): HorizontalFila {
  return {
    seccion,
    nombre,
    desde,
    hasta,
    variacion: hasta - desde,
    variacionPct: desde === 0 ? null : ((hasta - desde) / Math.abs(desde)) * 100,
  };
}
