-- CreateEnum
CREATE TYPE "EstadoProceso" AS ENUM ('SIN_INICIAR', 'EN_PROCESO', 'PENDIENTE', 'AL_DIA', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoActividadProceso" AS ENUM ('COMPROBANTES', 'CONCILIACION', 'NOMINA', 'PROVISION_CARTERA', 'PRESUPUESTO', 'CIERRE_PERIODO', 'CIERRE_ANIO');

-- CreateTable
CREATE TABLE "ProcesoContable" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "estado" "EstadoProceso" NOT NULL DEFAULT 'SIN_INICIAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcesoContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActividadProceso" (
    "id" SERIAL NOT NULL,
    "procesoId" TEXT NOT NULL,
    "tipo" "TipoActividadProceso" NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT false,
    "fechaEsperada" DATE,
    "fechaReal" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActividadProceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaSeguimiento" (
    "id" TEXT NOT NULL,
    "procesoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaSeguimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcesoContable_empresaId_idx" ON "ProcesoContable"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcesoContable_empresaId_anio_key" ON "ProcesoContable"("empresaId", "anio");

-- CreateIndex
CREATE INDEX "ActividadProceso_procesoId_idx" ON "ActividadProceso"("procesoId");

-- CreateIndex
CREATE INDEX "NotaSeguimiento_procesoId_idx" ON "NotaSeguimiento"("procesoId");

-- AddForeignKey
ALTER TABLE "ProcesoContable" ADD CONSTRAINT "ProcesoContable_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadProceso" ADD CONSTRAINT "ActividadProceso_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "ProcesoContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaSeguimiento" ADD CONSTRAINT "NotaSeguimiento_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "ProcesoContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaSeguimiento" ADD CONSTRAINT "NotaSeguimiento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
