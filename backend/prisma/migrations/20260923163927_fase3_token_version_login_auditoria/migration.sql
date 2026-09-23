-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'LOGIN_FALLIDO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'LOGIN_OK';
ALTER TYPE "AccionAuditoria" ADD VALUE 'CAMBIAR_PASSWORD';

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
