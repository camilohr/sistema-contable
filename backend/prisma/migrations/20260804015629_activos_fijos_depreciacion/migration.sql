-- CreateEnum
CREATE TYPE "MetodoDepreciacion" AS ENUM ('LINEA_RECTA');

-- CreateEnum
CREATE TYPE "EstadoActivoFijo" AS ENUM ('ACTIVO', 'DEPRECIADO_TOTAL', 'DADO_DE_BAJA');

-- CreateTable
CREATE TABLE "ActivoFijo" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "cuentaDepreciacionId" INTEGER NOT NULL,
    "cuentaGastoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaAdquisicion" DATE NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "vidaUtilMeses" INTEGER NOT NULL,
    "valorResidual" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "metodo" "MetodoDepreciacion" NOT NULL DEFAULT 'LINEA_RECTA',
    "depreciacionAcumulada" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "estado" "EstadoActivoFijo" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivoFijo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depreciacion" (
    "id" SERIAL NOT NULL,
    "activoId" INTEGER NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "comprobanteId" INTEGER,
    "valor" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Depreciacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivoFijo_estado_idx" ON "ActivoFijo"("estado");

-- CreateIndex
CREATE INDEX "Depreciacion_periodoId_idx" ON "Depreciacion"("periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "Depreciacion_activoId_periodoId_key" ON "Depreciacion"("activoId", "periodoId");

-- AddForeignKey
ALTER TABLE "ActivoFijo" ADD CONSTRAINT "ActivoFijo_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivoFijo" ADD CONSTRAINT "ActivoFijo_cuentaDepreciacionId_fkey" FOREIGN KEY ("cuentaDepreciacionId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivoFijo" ADD CONSTRAINT "ActivoFijo_cuentaGastoId_fkey" FOREIGN KEY ("cuentaGastoId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depreciacion" ADD CONSTRAINT "Depreciacion_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "ActivoFijo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depreciacion" ADD CONSTRAINT "Depreciacion_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depreciacion" ADD CONSTRAINT "Depreciacion_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
