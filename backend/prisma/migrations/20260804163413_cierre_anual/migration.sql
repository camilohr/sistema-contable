-- AlterEnum
ALTER TYPE "AccionAuditoria" ADD VALUE 'CERRAR_ANIO';

-- CreateTable
CREATE TABLE "CierreAnual" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "cuentaUtilidadId" INTEGER NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreAnual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CierreAnual_anio_key" ON "CierreAnual"("anio");

-- CreateIndex
CREATE UNIQUE INDEX "CierreAnual_comprobanteId_key" ON "CierreAnual"("comprobanteId");

-- AddForeignKey
ALTER TABLE "CierreAnual" ADD CONSTRAINT "CierreAnual_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreAnual" ADD CONSTRAINT "CierreAnual_cuentaUtilidadId_fkey" FOREIGN KEY ("cuentaUtilidadId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreAnual" ADD CONSTRAINT "CierreAnual_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
