-- CreateEnum
CREATE TYPE "EstadoConciliacion" AS ENUM ('EN_PROCESO', 'APROBADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "TipoAdjuntoEntidad" AS ENUM ('COMPROBANTE', 'EMPRESA');

-- CreateTable
CREATE TABLE "Adjunto" (
    "id" SERIAL NOT NULL,
    "empresaId" TEXT NOT NULL,
    "entidad" "TipoAdjuntoEntidad" NOT NULL,
    "entidadId" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Adjunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conciliacion" (
    "id" SERIAL NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "estado" "EstadoConciliacion" NOT NULL DEFAULT 'EN_PROCESO',
    "saldoLibros" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "saldoExtracto" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "diferencia" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "aprobadaPor" TEXT,
    "aprobadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoExtracto" (
    "id" SERIAL NOT NULL,
    "conciliacionId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "referencia" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "debito" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credito" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "hashMovimiento" TEXT NOT NULL,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "asientoId" INTEGER,

    CONSTRAINT "MovimientoExtracto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Adjunto_empresaId_entidad_entidadId_idx" ON "Adjunto"("empresaId", "entidad", "entidadId");

-- CreateIndex
CREATE INDEX "Conciliacion_empresaId_estado_idx" ON "Conciliacion"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Conciliacion_empresaId_periodoId_cuentaId_key" ON "Conciliacion"("empresaId", "periodoId", "cuentaId");

-- CreateIndex
CREATE INDEX "MovimientoExtracto_conciliacionId_idx" ON "MovimientoExtracto"("conciliacionId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoExtracto_conciliacionId_hashMovimiento_key" ON "MovimientoExtracto"("conciliacionId", "hashMovimiento");

-- AddForeignKey
ALTER TABLE "Adjunto" ADD CONSTRAINT "Adjunto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjunto" ADD CONSTRAINT "Adjunto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conciliacion" ADD CONSTRAINT "Conciliacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conciliacion" ADD CONSTRAINT "Conciliacion_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conciliacion" ADD CONSTRAINT "Conciliacion_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conciliacion" ADD CONSTRAINT "Conciliacion_aprobadaPor_fkey" FOREIGN KEY ("aprobadaPor") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoExtracto" ADD CONSTRAINT "MovimientoExtracto_conciliacionId_fkey" FOREIGN KEY ("conciliacionId") REFERENCES "Conciliacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoExtracto" ADD CONSTRAINT "MovimientoExtracto_asientoId_fkey" FOREIGN KEY ("asientoId") REFERENCES "Asiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
