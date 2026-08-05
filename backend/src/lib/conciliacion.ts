import { createHash } from "node:crypto";

export interface MovimientoEntrada {
  fecha: Date;
  referencia: string;
  descripcion: string;
  debito: number;
  credito: number;
  saldo: number;
}

export interface AsientoBanco {
  id: number;
  debito: number;
  credito: number;
  detalle?: string | null;
}

export interface MapaColumnas {
  fecha?: number;
  referencia?: number;
  descripcion?: number;
  debito?: number;
  credito?: number;
  saldo?: number;
}

const CAMPOS = ["fecha", "referencia", "descripcion", "debito", "credito", "saldo"] as const;

export function detectarSeparador(texto: string): string {
  const primeraLinea = texto.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const conteo: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of [";", ",", "\t"]) conteo[ch] = (primeraLinea.match(new RegExp(ch === "\t" ? "\\t" : `\\${ch}`, "g")) ?? []).length;
  const mejor = (Object.keys(conteo) as (keyof typeof conteo)[]).sort((a, b) => conteo[b] - conteo[a])[0];
  return conteo[mejor] > 0 ? mejor : ";";
}

export function parsearLineaCsv(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (ch === separador && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += ch;
    }
  }
  celdas.push(actual);
  return celdas.map((c) => c.trim());
}

function normalizarEncabezado(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function detectarMapaColumnas(encabezados: string[], forzado?: MapaColumnas): MapaColumnas {
  if (forzado && Object.values(forzado).some((v) => typeof v === "number")) {
    return {
      fecha: forzado.fecha,
      referencia: forzado.referencia,
      descripcion: forzado.descripcion,
      debito: forzado.debito,
      credito: forzado.credito,
      saldo: forzado.saldo,
    };
  }
  const mapa: MapaColumnas = {};
  const sinonimos: Record<string, (typeof CAMPOS)[number]> = {
    fecha: "fecha",
    date: "fecha",
    fechaoperacion: "fecha",
    fechaoperacionformato: "fecha",
    valorfecha: "fecha",
    referencia: "referencia",
    numero: "referencia",
    comprobante: "referencia",
    codigo: "referencia",
    nrodocumento: "referencia",
    descripcion: "descripcion",
    descripcionmovimiento: "descripcion",
    detalle: "descripcion",
    concepto: "descripcion",
    detallemovimiento: "descripcion",
    debito: "debito",
    debitos: "debito",
    depositos: "debito",
    movimiento: "debito",
    credito: "credito",
    creditos: "credito",
    retiros: "credito",
    saldo: "saldo",
  };
  for (let i = 0; i < encabezados.length; i++) {
    const clave = normalizarEncabezado(encabezados[i]);
    const campo = sinonimos[clave];
    if (campo && mapa[campo] === undefined) mapa[campo] = i;
  }
  return mapa;
}

export function normalizarNumero(valor: string): number {
  const limpio = String(valor).replace(/[^\d.,\-()]/g, "");
  if (!limpio) return 0;
  let negativo = limpio.startsWith("(") || limpio.startsWith("-");
  let n = limpio.replace(/^\(|\)$/g, "").replace("-", "");
  const ultimoPunto = n.lastIndexOf(".");
  const ultimaComa = n.lastIndexOf(",");
  if (ultimoPunto > -1 && ultimaComa > -1) {
    if (ultimoPunto > ultimaComa) {
      n = n.replace(/\./g, "").replace(",", ".");
    } else {
      n = n.replace(/,/g, "").replace(".", "");
    }
  } else if (ultimaComa > -1) {
    n = n.replace(/,/g, "");
  } else if (ultimoPunto > -1) {
    if (n.slice(ultimoPunto + 1).length === 3 && n.slice(0, ultimoPunto).length > 1) {
      n = n.replace(/\./g, "");
    } else {
      n = n.replace(".", "");
    }
  }
  const numero = Number(n);
  return negativo ? -numero : numero;
}

export function parsearFechaCsv(valor: string): Date {
  const limpio = String(valor).trim();
  let m = limpio.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = limpio.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let anio = Number(m[3]);
    if (anio < 100) anio += 2000;
    return new Date(anio, mes - 1, dia);
  }
  const d = new Date(limpio);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function parsearExtractoCsv(texto: string, mapa?: MapaColumnas): { movimientos: MovimientoEntrada[]; errores: string[] } {
  const separador = detectarSeparador(texto);
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const movimientos: MovimientoEntrada[] = [];
  const errores: string[] = [];

  if (lineas.length === 0) return { movimientos, errores };

  const primera = parsearLineaCsv(lineas[0], separador);
  const pareceEncabezado = primera.some((c) => ["fecha", "referencia", "descripcion", "debito", "credito", "saldo"].includes(normalizarEncabezado(c)));
  const mapaFinal = pareceEncabezado ? detectarMapaColumnas(primera, mapa) : detectarMapaColumnas([], mapa);
  const inicio = pareceEncabezado ? 1 : 0;

  for (let i = inicio; i < lineas.length; i++) {
    const celdas = parsearLineaCsv(lineas[i], separador);
    const idx = (campo: (typeof CAMPOS)[number]) => mapaFinal[campo] ?? 0;
    const fechaRaw = celdas[idx("fecha")] ?? "";
    const referencia = celdas[idx("referencia")] ?? "";
    const descripcion = celdas[idx("descripcion")] ?? "";
    const debito = normalizarNumero(celdas[idx("debito")] ?? "");
    const credito = normalizarNumero(celdas[idx("credito")] ?? "");
    const saldo = normalizarNumero(celdas[idx("saldo")] ?? "");
    if (debito === 0 && credito === 0 && !referencia && !descripcion) continue;
    const fecha = parsearFechaCsv(fechaRaw);
    if (Number.isNaN(fecha.getTime())) {
      errores.push(`Fila ${i + 1}: fecha inválida "${fechaRaw}"`);
      continue;
    }
    movimientos.push({ fecha, referencia, descripcion, debito, credito, saldo });
  }

  return { movimientos, errores };
}

export function hashMovimiento(m: { fecha: Date; referencia: string; descripcion: string; debito: number; credito: number }): string {
  const clave = [m.fecha.toISOString(), m.referencia, m.descripcion, m.debito, m.credito].join("|");
  return createHash("sha256").update(clave).digest("hex");
}

export function cruzarMovimientos(movimientos: { id: number; debito: number; credito: number }[], asientos: AsientoBanco[]): Map<number, number> {
  const usados = new Set<number>();
  const asignacion = new Map<number, number>();
  for (const mv of movimientos) {
    const monto = Math.abs(mv.debito - mv.credito);
    if (monto === 0) continue;
    const asiento = asientos.find((a) => Math.abs(a.debito - a.credito) === monto && !usados.has(a.id));
    if (asiento) {
      usados.add(asiento.id);
      asignacion.set(mv.id, asiento.id);
    }
  }
  return asignacion;
}
