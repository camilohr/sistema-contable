import { Prisma, PrismaClient } from "@prisma/client";

type DbEjecutor = Prisma.TransactionClient | PrismaClient;

export type EntidadSecuencia = "RECIBO" | "PAGO";

/**
 * Garantiza que exista la fila de secuencia para una entidad, inicializando
 * `ultimo` con el número existente más alto registrado. Debe llamarse fuera de
 * la transacción para que un P2002 concurrente no aborte una escritura previa.
 */
export async function asegurarSecuencia(
  db: DbEjecutor,
  entidad: EntidadSecuencia,
  calcularInicial: () => Promise<number>,
): Promise<void> {
  const existente = await db.secuencia.findUnique({ where: { entidad } });
  if (existente) return;
  try {
    await db.secuencia.create({ data: { entidad, ultimo: await calcularInicial() } });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
}

/**
 * Devuelve y avanza el siguiente número de una entidad de forma atómica.
 * Bloquea la fila con `FOR UPDATE` para que dos escrituras concurrentes no
 * puedan tomar el mismo número. Debe llamarse dentro de una transacción.
 */
export async function obtenerSiguienteNumeroSecuencia(db: DbEjecutor, entidad: EntidadSecuencia): Promise<number> {
  await db.secuencia.upsert({
    where: { entidad },
    create: { entidad, ultimo: 0 },
    update: {},
  });
  const filas = await db.$queryRaw<Array<{ ultimo: number }>>(
    Prisma.sql`SELECT "ultimo" FROM "Secuencia" WHERE "entidad" = ${entidad} FOR UPDATE`,
  );
  const siguiente = (filas[0]?.ultimo ?? 0) + 1;
  await db.secuencia.update({ where: { entidad }, data: { ultimo: siguiente } });
  return siguiente;
}