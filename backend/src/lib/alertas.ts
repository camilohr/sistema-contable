import { prisma } from "./prisma.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EstadoActivoFijo,
  EstadoCartera,
  EstadoComprobante,
  EstadoPeriodo,
  Prisma,
  TipoAlerta,
  TipoTercero,
} from "@prisma/client";

export interface ConfigRegla {
  tipo: TipoAlerta;
  dias: number | null;
  activa: boolean;
}

export const REGLAS_DEFECTO: ConfigRegla[] = [
  { tipo: TipoAlerta.CARTERA_VENCE, dias: 15, activa: true },
  { tipo: TipoAlerta.PERIODO_SIN_CERRAR, dias: null, activa: true },
  { tipo: TipoAlerta.ACTIVO_SIN_BAJA, dias: null, activa: true },
  { tipo: TipoAlerta.TERCERO_SIN_MOVIMIENTO, dias: 90, activa: true },
  { tipo: TipoAlerta.RESPALDO_DESACTUALIZADO, dias: 2, activa: true },
];

export type SeveridadAlerta = "ALTA" | "MEDIA" | "BAJA";

export interface AlertaGenerada {
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  mensaje: string;
  entidad: string;
  entidadId: string;
  fecha: string;
  monto?: number;
}

function inicioDeHoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMonto(v: Prisma.Decimal | number): string {
  const n = typeof v === "number" ? v : Number(v);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

interface DocumentoVencimiento {
  id: number;
  numeroDocumento: string;
  fechaVencimiento: Date;
  saldo: Prisma.Decimal;
  tercero: { nombreRazonSocial: string };
}

function construirVencimientos(regla: ConfigRegla, docs: DocumentoVencimiento[], entidad: string, prefijo: string): AlertaGenerada[] {
  const hoy = inicioDeHoy();
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + (regla.dias ?? 15));
  const out: AlertaGenerada[] = [];
  for (const d of docs) {
    if (d.fechaVencimiento.getTime() > limite.getTime()) continue;
    const vencida = d.fechaVencimiento.getTime() < hoy.getTime();
    out.push({
      tipo: regla.tipo,
      severidad: vencida ? "ALTA" : "MEDIA",
      mensaje: `${prefijo} ${d.numeroDocumento} de ${d.tercero.nombreRazonSocial} por ${fmtMonto(d.saldo)} ${
        vencida ? "venció" : "vence"
      } el ${fmtFecha(d.fechaVencimiento)}.`,
      entidad,
      entidadId: String(d.id),
      fecha: fmtFecha(d.fechaVencimiento),
      monto: Number(d.saldo),
    });
  }
  return out;
}

async function evaluarCartera(regla: ConfigRegla, empresaId: string): Promise<AlertaGenerada[]> {
  const hoy = inicioDeHoy();
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + (regla.dias ?? 15));

  const [cxc, cxp] = await Promise.all([
    prisma.cuentaPorCobrar.findMany({
      where: {
        empresaId,
        saldo: { gt: 0 },
        estado: { in: [EstadoCartera.PENDIENTE, EstadoCartera.VENCIDA] },
        fechaVencimiento: { lte: limite },
      },
      include: { tercero: { select: { nombreRazonSocial: true } } },
      orderBy: { fechaVencimiento: "asc" },
      take: 50,
    }),
    prisma.cuentaPorPagar.findMany({
      where: {
        empresaId,
        saldo: { gt: 0 },
        estado: { in: [EstadoCartera.PENDIENTE, EstadoCartera.VENCIDA] },
        fechaVencimiento: { lte: limite },
      },
      include: { tercero: { select: { nombreRazonSocial: true } } },
      orderBy: { fechaVencimiento: "asc" },
      take: 50,
    }),
  ]);

  return [
    ...construirVencimientos(regla, cxc, "CuentaPorCobrar", "CxC"),
    ...construirVencimientos(regla, cxp, "CuentaPorPagar", "CxP"),
  ];
}

async function evaluarPeriodos(regla: ConfigRegla, empresaId: string): Promise<AlertaGenerada[]> {
  const hoy = inicioDeHoy();
  const periodos = await prisma.periodo.findMany({
    where: { empresaId, estado: EstadoPeriodo.ABIERTO, fechaFin: { lt: hoy } },
    orderBy: { fechaFin: "asc" },
    take: 20,
  });
  return periodos.map((p) => ({
    tipo: regla.tipo,
    severidad: "MEDIA" as SeveridadAlerta,
    mensaje: `El periodo ${p.nombre} terminó el ${fmtFecha(p.fechaFin)} y sigue abierto.`,
    entidad: "Periodo",
    entidadId: String(p.id),
    fecha: fmtFecha(p.fechaFin),
  }));
}

async function evaluarActivos(regla: ConfigRegla, empresaId: string): Promise<AlertaGenerada[]> {
  const activos = await prisma.activoFijo.findMany({
    where: { empresaId, estado: EstadoActivoFijo.DEPRECIADO_TOTAL },
    orderBy: { fechaAdquisicion: "desc" },
    take: 20,
  });
  return activos.map((a) => ({
    tipo: regla.tipo,
    severidad: "MEDIA" as SeveridadAlerta,
    mensaje: `El activo ${a.nombre} está totalmente depreciado y no se ha dado de baja.`,
    entidad: "ActivoFijo",
    entidadId: String(a.id),
    fecha: fmtFecha(a.fechaAdquisicion),
    monto: Number(a.valor),
  }));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_RESPALDO_DEFECTO = path.resolve(__dirname, "..", "..", "..", "backups", "backup.log");

export function caminoLogRespaldo(): string {
  return process.env.BACKUP_LOG_PATH ? path.resolve(process.env.BACKUP_LOG_PATH) : LOG_RESPALDO_DEFECTO;
}

export async function ultimoRespaldoExitoso(logFile: string): Promise<Date | null> {
  let contenido: string;
  try {
    contenido = await readFile(logFile, "utf8");
  } catch {
    return null;
  }
  const fechas: Date[] = [];
  for (const m of contenido.matchAll(/^(\S+Z)\s+OK\s+respaldo/mg)) {
    const d = new Date(m[1]);
    if (!isNaN(d.getTime())) fechas.push(d);
  }
  if (fechas.length === 0) return null;
  return new Date(Math.max(...fechas.map((d) => d.getTime())));
}

async function evaluarRespaldo(regla: ConfigRegla): Promise<AlertaGenerada[]> {
  const dias = regla.dias ?? 2;
  const ultimo = await ultimoRespaldoExitoso(caminoLogRespaldo());
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  if (ultimo === null || ultimo.getTime() < limite) {
    const mensaje =
      ultimo === null
        ? "No hay ningún respaldo exitoso registrado en backups/backup.log. Configure la tarea programada."
        : `El último respaldo exitoso fue el ${fmtFecha(ultimo)} (más de ${dias} días). Revise la tarea programada.`;
    return [
      {
        tipo: regla.tipo,
        severidad: "ALTA" as SeveridadAlerta,
        mensaje,
        entidad: "Sistema",
        entidadId: "respaldo",
        fecha: fmtFecha(ultimo ?? new Date()),
      },
    ];
  }
  return [];
}

async function evaluarTerceros(regla: ConfigRegla, empresaId: string): Promise<AlertaGenerada[]> {
  const dias = regla.dias ?? 90;
  const hoy = inicioDeHoy();
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() - dias);
  const terceros = await prisma.tercero.findMany({
    where: { empresaId, activo: true, tipo: { in: [TipoTercero.CLIENTE, TipoTercero.AMBOS] } },
    select: {
      id: true,
      nombreRazonSocial: true,
      _count: {
        select: {
          comprobantes: { where: { estado: EstadoComprobante.CONTABILIZADO, fecha: { gte: limite } } },
          recibos: { where: { fecha: { gte: limite } } },
        },
      },
    },
    orderBy: { nombreRazonSocial: "asc" },
    take: 200,
  });
  return terceros
    .filter((t) => t._count.comprobantes === 0 && t._count.recibos === 0)
    .slice(0, 20)
    .map((t) => ({
      tipo: regla.tipo,
      severidad: "BAJA" as SeveridadAlerta,
      mensaje: `El cliente ${t.nombreRazonSocial} no registra movimientos en los últimos ${dias} días.`,
      entidad: "Tercero",
      entidadId: t.id,
      fecha: fmtFecha(hoy),
    }));
}

export async function cargarReglas(): Promise<ConfigRegla[]> {
  const reglasDb = await prisma.reglaAlerta.findMany();
  const porTipo = new Map(reglasDb.map((r) => [r.tipo, r]));
  return REGLAS_DEFECTO.map((d) => {
    const r = porTipo.get(d.tipo);
    return r ? { tipo: r.tipo, dias: r.dias, activa: r.activa } : d;
  });
}

export async function evaluarAlertas(empresaId: string): Promise<AlertaGenerada[]> {
  const reglas = await cargarReglas();
  const resultado: AlertaGenerada[] = [];
  for (const regla of reglas) {
    if (!regla.activa) continue;
    switch (regla.tipo) {
      case TipoAlerta.CARTERA_VENCE:
        resultado.push(...(await evaluarCartera(regla, empresaId)));
        break;
      case TipoAlerta.PERIODO_SIN_CERRAR:
        resultado.push(...(await evaluarPeriodos(regla, empresaId)));
        break;
      case TipoAlerta.ACTIVO_SIN_BAJA:
        resultado.push(...(await evaluarActivos(regla, empresaId)));
        break;
      case TipoAlerta.TERCERO_SIN_MOVIMIENTO:
        resultado.push(...(await evaluarTerceros(regla, empresaId)));
        break;
      case TipoAlerta.RESPALDO_DESACTUALIZADO:
        resultado.push(...(await evaluarRespaldo(regla)));
        break;
    }
  }
  const ordenSeveridad: Record<SeveridadAlerta, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
  return resultado.sort((a, b) => {
    const s = ordenSeveridad[a.severidad] - ordenSeveridad[b.severidad];
    if (s !== 0) return s;
    return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
  });
}
