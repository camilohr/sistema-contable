-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('CARTERA_VENCE', 'PERIODO_SIN_CERRAR', 'ACTIVO_SIN_BAJA', 'TERCERO_SIN_MOVIMIENTO');

-- CreateTable
CREATE TABLE "ReglaAlerta" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoAlerta" NOT NULL,
    "dias" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglaAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReglaAlerta_tipo_key" ON "ReglaAlerta"("tipo");
