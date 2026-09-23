import { Prisma, EstadoComprobante, EstadoPeriodo, PrismaClient } from "@prisma/client";
import { obtenerSiguienteConsecutivo } from "./consecutivo.js";

type DbEjecutor = Prisma.TransactionClient | PrismaClient;

export interface AsientoGenerado {
  cuentaId: number;
  debito: number;
  credito: number;
  detalle?: string;
}

interface CrearComprobanteDiarioArgs {
  empresaId: string;
  periodoId: number;
  fecha: Date;
  concepto: string;
  usuarioId: string;
  asientos: AsientoGenerado[];
  estado?: EstadoComprobante;
  verificarPeriodoAbierto?: boolean;
  verificarCuentas?: boolean;
}

/**
 * Crea un comprobante DIARIO con su consecutivo, exigiendo partida doble. Se usa
 * para comprobantes generados por el sistema (depreciación, baja, cierre anual,
 * provisión de cartera, nómina). Por defecto queda CONTABILIZADO; los módulos con
 * aprobación de segundo revisor (depreciación, provisiones — S1-15) crean el
 * comprobante en BORRADOR y lo contabilizan después con su endpoint dedicado.
 */
export async function crearComprobanteDiario(db: DbEjecutor, data: CrearComprobanteDiarioArgs) {
  if (data.asientos.length < 2) {
    throw new Error("Un comprobante requiere al menos 2 asientos");
  }
  const totalDebito = data.asientos.reduce((s, a) => s.plus(a.debito), new Prisma.Decimal(0));
  const totalCredito = data.asientos.reduce((s, a) => s.plus(a.credito), new Prisma.Decimal(0));
  if (!totalDebito.equals(totalCredito)) {
    throw new Error(`La partida doble no cuadra: débitos ${totalDebito.toFixed(2)} vs créditos ${totalCredito.toFixed(2)}`);
  }

  const periodo = await db.periodo.findFirst({ where: { id: data.periodoId, empresaId: data.empresaId } });
  if (!periodo) {
    throw new Error(`No existe el periodo ${data.periodoId} para la empresa`);
  }
  if (data.fecha < periodo.fechaInicio || data.fecha > periodo.fechaFin) {
    throw new Error(`La fecha ${data.fecha.toISOString().slice(0, 10)} no está dentro del periodo ${periodo.nombre}`);
  }
  if ((data.verificarPeriodoAbierto ?? true) && periodo.estado !== EstadoPeriodo.ABIERTO) {
    throw new Error(`El periodo ${periodo.nombre} no está abierto`);
  }

  if (data.verificarCuentas ?? true) {
    const ids = [...new Set(data.asientos.map((a) => a.cuentaId))];
    const cuentas = await db.cuenta.findMany({ where: { id: { in: ids } } });
    const porId = new Map(cuentas.map((c) => [c.id, c]));
    for (const a of data.asientos) {
      const act = porId.get(a.cuentaId);
      if (!act) {
        throw new Error(`No existe la cuenta ${a.cuentaId}`);
      }
      if (!act.activa) {
        throw new Error(`La cuenta ${act.codigo} está inactiva`);
      }
      if (!act.permiteMovimiento) {
        throw new Error(`La cuenta ${act.codigo} no permite movimiento directo`);
      }
      if (act.requiereTercero) {
        throw new Error(`La cuenta ${act.codigo} requiere tercero y no se asocia en los comprobantes generados`);
      }
    }
  }

  const consecutivo = await obtenerSiguienteConsecutivo(db, data.empresaId, "DIARIO");

  return db.comprobante.create({
    data: {
      empresaId: data.empresaId,
      tipo: "DIARIO",
      consecutivo,
      fecha: data.fecha,
      periodoId: data.periodoId,
      concepto: data.concepto,
      totalDebito,
      totalCredito,
      estado: data.estado ?? EstadoComprobante.CONTABILIZADO,
      usuarioCreoId: data.usuarioId,
      asientos: {
        create: data.asientos.map((a) => ({
          cuentaId: a.cuentaId,
          debito: a.debito,
          credito: a.credito,
          detalle: a.detalle ?? null,
        })),
      },
    },
    include: { asientos: { include: { cuenta: { select: { codigo: true } } } }, periodo: true },
  });
}
