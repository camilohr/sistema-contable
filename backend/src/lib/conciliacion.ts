import { createHash } from "node:crypto";
import { z } from "zod";
import { EstadoComprobante, EstadoConciliacion, AccionAuditoria } from "@prisma/client";
import { prisma } from "./prisma.js";
import { registrarAuditoria } from "./auditoria.js";

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

export interface RespuestaHttp {
  status: number;
  body: object;
}

export async function resolverCuentaBanco(empresaId: string, cuentaId?: number): Promise<number | null> {
  if (cuentaId) {
    const cuenta = await prisma.cuenta.findFirst({ where: { id: cuentaId, OR: [{ empresaId }, { empresaId: null }] } });
    return cuenta ? cuenta.id : null;
  }
  const cuenta = await prisma.cuenta.findFirst({
    where: { codigo: { startsWith: "1110" }, OR: [{ empresaId: null }, { empresaId }], activa: true },
    orderBy: { codigo: "asc" },
  });
  return cuenta?.id ?? null;
}

export async function saldoLibrosAcumulado(empresaId: string, cuentaId: number, fechaCorte: Date): Promise<number> {
  const comprobantes = await prisma.comprobante.findMany({
    where: { empresaId, estado: { in: [EstadoComprobante.CONTABILIZADO, EstadoComprobante.ANULADO] }, fecha: { lte: fechaCorte } },
    select: { asientos: { where: { cuentaId }, select: { debito: true, credito: true } } },
  });
  let debitos = 0;
  let creditos = 0;
  for (const c of comprobantes) {
    for (const a of c.asientos) {
      debitos += a.debito.toNumber();
      creditos += a.credito.toNumber();
    }
  }
  return debitos - creditos;
}

export async function asientosBancoPeriodo(empresaId: string, cuentaId: number, fechaInicio: Date, fechaFin: Date) {
  const asientos = await prisma.asiento.findMany({
    where: {
      cuentaId,
      comprobante: { empresaId, estado: { in: [EstadoComprobante.CONTABILIZADO, EstadoComprobante.ANULADO] }, fecha: { gte: fechaInicio, lte: fechaFin } },
    },
    select: { id: true, debito: true, credito: true, detalle: true },
  });
  return asientos.map((a) => ({ id: a.id, debito: a.debito.toNumber(), credito: a.credito.toNumber(), detalle: a.detalle }));
}

const importarConciliacionSchema = z.object({
  periodoId: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive().optional(),
  fechaCol: z.coerce.number().int().nonnegative().optional(),
  referenciaCol: z.coerce.number().int().nonnegative().optional(),
  descripcionCol: z.coerce.number().int().nonnegative().optional(),
  debitoCol: z.coerce.number().int().nonnegative().optional(),
  creditoCol: z.coerce.number().int().nonnegative().optional(),
  saldoCol: z.coerce.number().int().nonnegative().optional(),
});

export async function importarOrquestado(args: {
  empresaId?: string;
  usuarioId: string;
  body: unknown;
  archivo?: { buffer: Buffer };
}): Promise<RespuestaHttp> {
  const { empresaId, usuarioId, body, archivo } = args;
  const parsed = importarConciliacionSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Datos inválidos", detalle: parsed.error.flatten().fieldErrors } };
  }
  const { periodoId, cuentaId: cuentaIdProp, fechaCol, referenciaCol, descripcionCol, debitoCol, creditoCol, saldoCol } = parsed.data;

  if (!archivo) {
    return { status: 400, body: { error: "No se recibió el archivo CSV (campo 'archivo')" } };
  }
  const periodo = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId: empresaId! } });
  if (!periodo) {
    return { status: 404, body: { error: "Periodo no encontrado" } };
  }
  const cuentaId = await resolverCuentaBanco(empresaId!, cuentaIdProp);
  if (!cuentaId) {
    return { status: 404, body: { error: "No se encontró una cuenta de bancos (1110) para conciliar" } };
  }

  const mapa: MapaColumnas = {
    fecha: fechaCol,
    referencia: referenciaCol,
    descripcion: descripcionCol,
    debito: debitoCol,
    credito: creditoCol,
    saldo: saldoCol,
  };

  const texto = archivo.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const { movimientos, errores } = parsearExtractoCsv(texto, mapa);
  if (movimientos.length === 0) {
    return { status: 400, body: { error: `No se pudo leer el extracto: ${errores.join("; ") || "archivo vacío o sin filas válidas"}` } };
  }

  const saldo = await saldoLibrosAcumulado(empresaId!, cuentaId, periodo.fechaFin);
  const saldoExtracto = movimientos[movimientos.length - 1].saldo;

  const conciliacion = await prisma.conciliacion.upsert({
    where: { empresaId_periodoId_cuentaId: { empresaId: empresaId!, periodoId, cuentaId } },
    update: { saldoExtracto, saldoLibros: saldo, estado: EstadoConciliacion.EN_PROCESO },
    create: { empresaId: empresaId!, periodoId, cuentaId, saldoExtracto, saldoLibros: saldo, estado: EstadoConciliacion.EN_PROCESO },
  });

  const asientos = await asientosBancoPeriodo(empresaId!, cuentaId, periodo.fechaInicio, periodo.fechaFin);
  const registros = movimientos.map((m) => ({ ...m, hashMovimiento: hashMovimiento(m) }));
  const existentes = await prisma.movimientoExtracto.findMany({
    where: { conciliacionId: conciliacion.id, hashMovimiento: { in: registros.map((r) => r.hashMovimiento) } },
    select: { id: true, hashMovimiento: true, asientoId: true },
  });
  const hashExistentes = new Set(existentes.map((e) => e.hashMovimiento));

  const aCrear = registros.filter((r) => !hashExistentes.has(r.hashMovimiento));
  if (aCrear.length > 0) {
    await prisma.movimientoExtracto.createMany({
      data: aCrear.map((r) => ({
        conciliacionId: conciliacion.id,
        fecha: r.fecha,
        referencia: r.referencia,
        descripcion: r.descripcion,
        debito: r.debito,
        credito: r.credito,
        saldo: r.saldo,
        hashMovimiento: r.hashMovimiento,
      })),
    });
  }

  const conciliados = await prisma.movimientoExtracto.findMany({
    where: { conciliacionId: conciliacion.id },
    select: { id: true, debito: true, credito: true, asientoId: true },
  });
  const asignacion = cruzarMovimientos(
    conciliados.filter((m) => !m.asientoId).map((m) => ({ id: m.id, debito: m.debito.toNumber(), credito: m.credito.toNumber() })),
    asientos
  );
  for (const [movId, asientoId] of asignacion) {
    await prisma.movimientoExtracto.update({ where: { id: movId }, data: { conciliado: true, asientoId } });
  }
  const diferencia = Math.round((saldoExtracto - saldo) * 100) / 100;
  await prisma.conciliacion.update({ where: { id: conciliacion.id }, data: { diferencia } });

  await registrarAuditoria(prisma, {
    usuarioId,
    empresaId: empresaId!,
    accion: AccionAuditoria.IMPORTAR_EXTRACTO,
    entidad: "CONCILIACION",
    entidadId: conciliacion.id,
    detalle: { filasImportadas: aCrear.length, total: movimientos.length, errores: errores.slice(0, 10) },
  });

  return {
    status: 201,
    body: {
      conciliacion: { ...conciliacion, diferencia },
      importadas: aCrear.length,
      totalArchivo: movimientos.length,
      errores: errores.slice(0, 20),
      movimientos: conciliados.length,
      conciliados: conciliados.filter((m) => m.asientoId || asignacion.has(m.id)).length,
    },
  };
}
