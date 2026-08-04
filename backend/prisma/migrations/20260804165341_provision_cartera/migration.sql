-- AlterEnum
ALTER TYPE "AccionAuditoria" ADD VALUE 'CALCULAR_PROVISION';

-- CreateTable
CREATE TABLE "ParametroProvision" (
    "id" SERIAL NOT NULL,
    "diasDesde" INTEGER NOT NULL,
    "diasHasta" INTEGER,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParametroProvision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisionCartera" (
    "id" SERIAL NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "comprobanteId" INTEGER,
    "totalCalculado" DECIMAL(15,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisionCartera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParametroProvision_diasDesde_diasHasta_key" ON "ParametroProvision"("diasDesde", "diasHasta");

-- CreateIndex
CREATE INDEX "ProvisionCartera_periodoId_idx" ON "ProvisionCartera"("periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisionCartera_periodoId_key" ON "ProvisionCartera"("periodoId");

-- AddForeignKey
ALTER TABLE "ProvisionCartera" ADD CONSTRAINT "ProvisionCartera_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionCartera" ADD CONSTRAINT "ProvisionCartera_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
