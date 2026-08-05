import { Prisma, PrismaClient, TipoActividadProceso } from "@prisma/client";

type DbEjecutor = Prisma.TransactionClient | PrismaClient;

export interface ActividadPlantilla {
  tipo: TipoActividadProceso;
  orden: number;
  descripcion: string;
}

export const PLANTILLA_ACTIVIDADES: ActividadPlantilla[] = [
  { tipo: "COMPROBANTES", orden: 1, descripcion: "Comprobantes y asientos al día" },
  { tipo: "CONCILIACION", orden: 2, descripcion: "Conciliaciones bancarias" },
  { tipo: "NOMINA", orden: 3, descripcion: "Nómina liquidada y provisionada" },
  { tipo: "PROVISION_CARTERA", orden: 4, descripcion: "Provisión de cartera" },
  { tipo: "PRESUPUESTO", orden: 5, descripcion: "Presupuesto cargado" },
  { tipo: "CIERRE_PERIODO", orden: 6, descripcion: "Cierre de periodos" },
  { tipo: "CIERRE_ANIO", orden: 7, descripcion: "Cierre de año" },
];

export const DESCRIPCION_ACTIVIDAD: Record<string, string> = Object.fromEntries(
  PLANTILLA_ACTIVIDADES.map((a) => [a.tipo, a.descripcion])
);

export async function crearProcesoConPlantilla(db: DbEjecutor, empresaId: string, anio: number) {
  return db.procesoContable.create({
    data: {
      empresaId,
      anio,
      actividades: {
        create: PLANTILLA_ACTIVIDADES.map((a) => ({ tipo: a.tipo, orden: a.orden })),
      },
    },
    include: { actividades: { orderBy: { orden: "asc" } } },
  });
}

/**
 * Marca como completada la actividad de un proceso (si el proceso del año existe).
 * Se invoca dentro de la misma transacción que produce la operación contable,
 * de modo que el marcado queda o no queda junto con ella.
 */
export async function marcarActividadProceso(
  db: DbEjecutor,
  empresaId: string,
  anio: number,
  tipo: TipoActividadProceso,
  fecha?: Date
): Promise<boolean> {
  const proceso = await db.procesoContable.findUnique({
    where: { empresaId_anio: { empresaId, anio } },
    select: { id: true, actividades: { where: { tipo }, select: { id: true } } },
  });
  if (!proceso || proceso.actividades.length === 0) return false;
  await db.actividadProceso.update({
    where: { id: proceso.actividades[0].id },
    data: { estado: true, fechaReal: fecha ?? new Date() },
  });
  return true;
}
