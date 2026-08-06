import { Prisma, PrismaClient, TipoComprobante } from "@prisma/client";

type DbEjecutor = Prisma.TransactionClient | PrismaClient;

/**
 * Asigna el siguiente consecutivo de forma atómica para un tipo y empresa.
 * Bloquea la fila del Consecutivo con `FOR UPDATE` para que dos creaciones
 * concurrentes no puedan tomar el mismo número (no es leer-luego-escribir).
 * Debe llamarse dentro de una transacción.
 */
export async function obtenerSiguienteConsecutivo(db: DbEjecutor, empresaId: string, tipo: TipoComprobante): Promise<number> {
  await db.consecutivo.upsert({
    where: { empresaId_tipo: { empresaId, tipo } },
    create: { empresaId, tipo, ultimo: 0 },
    update: {},
  });

  const filas = await db.$queryRaw<Array<{ ultimo: number }>>(
    Prisma.sql`SELECT "ultimo" FROM "Consecutivo" WHERE "empresaId" = ${empresaId} AND "tipo" = ${tipo}::"TipoComprobante" FOR UPDATE`,
  );
  const siguiente = (filas[0]?.ultimo ?? 0) + 1;
  await db.consecutivo.update({
    where: { empresaId_tipo: { empresaId, tipo } },
    data: { ultimo: siguiente },
  });
  return siguiente;
}
