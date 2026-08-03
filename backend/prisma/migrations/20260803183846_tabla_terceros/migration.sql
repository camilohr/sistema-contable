-- CreateEnum
CREATE TYPE "TipoTercero" AS ENUM ('CLIENTE', 'PROVEEDOR', 'AMBOS');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CC', 'NIT', 'CE', 'PASAPORTE');

-- CreateTable
CREATE TABLE "Tercero" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTercero" NOT NULL DEFAULT 'CLIENTE',
    "tipoDocumento" "TipoDocumento" NOT NULL,
    "documento" TEXT NOT NULL,
    "nombreRazonSocial" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "ciudad" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tercero_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tercero_tipo_idx" ON "Tercero"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Tercero_tipoDocumento_documento_key" ON "Tercero"("tipoDocumento", "documento");
