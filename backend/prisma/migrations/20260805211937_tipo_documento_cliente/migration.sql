-- CreateEnum
CREATE TYPE "TipoDocumentoCliente" AS ENUM ('NIT', 'CC', 'CE', 'PASAPORTE');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "tipoDocumento" "TipoDocumentoCliente" NOT NULL DEFAULT 'NIT';
