-- AlterEnum
ALTER TYPE "AccionAuditoria" ADD VALUE 'CARGAR_PRESUPUESTO';

-- CreateTable
CREATE TABLE "Presupuesto" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Presupuesto_periodoId_idx" ON "Presupuesto"("periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_cuentaId_periodoId_key" ON "Presupuesto"("cuentaId", "periodoId");

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
