-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'DESCARGAR_ADJUNTO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ANONIMIZAR_TERCERO';

-- AlterTable
ALTER TABLE "ParametroNomina" ADD COLUMN     "cesantias" DECIMAL(5,2) NOT NULL DEFAULT 8.33,
ADD COLUMN     "prima" DECIMAL(5,2) NOT NULL DEFAULT 8.33,
ADD COLUMN     "vacaciones" DECIMAL(5,2) NOT NULL DEFAULT 4.17;

-- AlterTable
ALTER TABLE "Tercero" ADD COLUMN     "anonimizado" BOOLEAN NOT NULL DEFAULT false;
