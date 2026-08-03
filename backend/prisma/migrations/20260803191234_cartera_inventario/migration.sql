-- CreateEnum
CREATE TYPE "EstadoCartera" AS ENUM ('PENDIENTE', 'ABONADA', 'CANCELADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "FormaPago" AS ENUM ('EFECTIVO', 'CHEQUE', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateTable
CREATE TABLE "CuentaPorCobrar" (
    "id" SERIAL NOT NULL,
    "terceroId" TEXT NOT NULL,
    "comprobanteId" INTEGER,
    "numeroDocumento" TEXT NOT NULL,
    "fechaEmision" DATE NOT NULL,
    "fechaVencimiento" DATE NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "saldo" DECIMAL(15,2) NOT NULL,
    "estado" "EstadoCartera" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaPorCobrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaPorPagar" (
    "id" SERIAL NOT NULL,
    "terceroId" TEXT NOT NULL,
    "comprobanteId" INTEGER,
    "numeroDocumento" TEXT NOT NULL,
    "fechaEmision" DATE NOT NULL,
    "fechaVencimiento" DATE NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "saldo" DECIMAL(15,2) NOT NULL,
    "estado" "EstadoCartera" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaPorPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recibo" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "terceroId" TEXT NOT NULL,
    "cxcId" INTEGER,
    "comprobanteId" INTEGER,
    "valor" DECIMAL(15,2) NOT NULL,
    "formaPago" "FormaPago" NOT NULL DEFAULT 'EFECTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "terceroId" TEXT NOT NULL,
    "cxpId" INTEGER,
    "comprobanteId" INTEGER,
    "valor" DECIMAL(15,2) NOT NULL,
    "formaPago" "FormaPago" NOT NULL DEFAULT 'EFECTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "unidad" TEXT NOT NULL DEFAULT 'und',
    "costoPromedio" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cantidadActual" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioMovimiento" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "comprobanteId" INTEGER,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "cantidad" DECIMAL(15,2) NOT NULL,
    "costoUnitario" DECIMAL(15,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CuentaPorCobrar_terceroId_idx" ON "CuentaPorCobrar"("terceroId");

-- CreateIndex
CREATE INDEX "CuentaPorCobrar_estado_idx" ON "CuentaPorCobrar"("estado");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_terceroId_idx" ON "CuentaPorPagar"("terceroId");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_estado_idx" ON "CuentaPorPagar"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigo_key" ON "Producto"("codigo");

-- CreateIndex
CREATE INDEX "Producto_activo_idx" ON "Producto"("activo");

-- CreateIndex
CREATE INDEX "InventarioMovimiento_productoId_idx" ON "InventarioMovimiento"("productoId");

-- AddForeignKey
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_cxcId_fkey" FOREIGN KEY ("cxcId") REFERENCES "CuentaPorCobrar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cxpId_fkey" FOREIGN KEY ("cxpId") REFERENCES "CuentaPorPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioMovimiento" ADD CONSTRAINT "InventarioMovimiento_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioMovimiento" ADD CONSTRAINT "InventarioMovimiento_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
