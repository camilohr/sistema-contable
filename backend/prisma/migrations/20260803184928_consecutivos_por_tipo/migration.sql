-- CreateTable
CREATE TABLE "Consecutivo" (
    "tipo" "TipoComprobante" NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Consecutivo_pkey" PRIMARY KEY ("tipo")
);
