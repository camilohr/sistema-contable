-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'SUBIR_ADJUNTO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ELIMINAR_ADJUNTO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'IMPORTAR_EXTRACTO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'APROBAR_CONCILIACION';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ANULAR_CONCILIACION';
