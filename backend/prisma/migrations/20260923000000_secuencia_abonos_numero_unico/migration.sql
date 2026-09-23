-- CreateTable
CREATE TABLE "Secuencia" (
    "entidad" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Secuencia_pkey" PRIMARY KEY ("entidad")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pago_numero_key" ON "Pago"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_numero_key" ON "Recibo"("numero");