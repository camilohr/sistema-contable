import { Prisma, EstadoComprobante, PrismaClient } from "@prisma/client";
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
}

/**
 * Crea un comprobante DIARIO CONTABILIZADO con su consecutivo, exigiendo
 * partida doble. Se usa para comprobantes generados por el sistema
 * (depreciación, baja, cierre anual, provisión de cartera).
 */
export async function crearComprobanteDiario(db: DbEjecutor, data: CrearComprobanteDiarioArgs) {
  const totalDebito = data.asientos.reduce((s, a) => s.plus(a.debito), new Prisma.Decimal(0));
  const totalCredito = data.asientos.reduce((s, a) => s.plus(a.credito), new Prisma.Decimal(0));
  if (!totalDebito.equals(totalCredito)) {
    throw new Error(`La partida doble no cuadra: débitos ${totalDebito.toFixed(2)} vs créditos ${totalCredito.toFixed(2)}`);
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
      estado: EstadoComprobante.CONTABILIZADO,
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
