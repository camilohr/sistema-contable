import { Prisma, AccionAuditoria, PrismaClient } from "@prisma/client";

type DbEjecutor = Prisma.TransactionClient | PrismaClient;

interface RegistrarAuditoriaArgs {
  usuarioId: string;
  empresaId?: string;
  accion: AccionAuditoria;
  entidad: string;
  entidadId: string | number;
  detalle?: Prisma.InputJsonValue;
}

/**
 * Escribe un registro inmutable en la bitácora de auditoría.
 * Se invoca dentro de la misma transacción Prisma que produce el cambio,
 * de modo que el registro queda o no queda junto con la operación principal.
 */
export async function registrarAuditoria(db: DbEjecutor, args: RegistrarAuditoriaArgs): Promise<void> {
  await db.auditoria.create({
    data: {
      empresaId: args.empresaId ?? null,
      usuarioId: args.usuarioId,
      accion: args.accion,
      entidad: args.entidad,
      entidadId: String(args.entidadId),
      detalle: args.detalle ?? Prisma.JsonNull,
    },
  });
}
