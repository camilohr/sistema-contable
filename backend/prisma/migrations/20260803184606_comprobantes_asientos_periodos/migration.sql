-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('DIARIO', 'INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('BORRADOR', 'CONTABILIZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateTable
CREATE TABLE "Periodo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "fechaFin" DATE NOT NULL,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'ABIERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoComprobante" NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "terceroId" TEXT,
    "concepto" TEXT NOT NULL,
    "totalDebito" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalCredito" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'BORRADOR',
    "usuarioCreoId" TEXT NOT NULL,
    "usuarioAnuloId" TEXT,
    "fechaAnulacion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asiento" (
    "id" SERIAL NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "terceroId" TEXT,
    "debito" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credito" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "detalle" TEXT,

    CONSTRAINT "Asiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Periodo_nombre_key" ON "Periodo"("nombre");

-- CreateIndex
CREATE INDEX "Periodo_estado_idx" ON "Periodo"("estado");

-- CreateIndex
CREATE INDEX "Comprobante_periodoId_idx" ON "Comprobante"("periodoId");

-- CreateIndex
CREATE INDEX "Comprobante_fecha_idx" ON "Comprobante"("fecha");

-- CreateIndex
CREATE INDEX "Comprobante_estado_idx" ON "Comprobante"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_tipo_consecutivo_key" ON "Comprobante"("tipo", "consecutivo");

-- CreateIndex
CREATE INDEX "Asiento_comprobanteId_idx" ON "Asiento"("comprobanteId");

-- CreateIndex
CREATE INDEX "Asiento_cuentaId_idx" ON "Asiento"("cuentaId");

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_usuarioCreoId_fkey" FOREIGN KEY ("usuarioCreoId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_usuarioAnuloId_fkey" FOREIGN KEY ("usuarioAnuloId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
