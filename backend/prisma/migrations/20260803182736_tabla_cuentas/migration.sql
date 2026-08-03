-- CreateEnum
CREATE TYPE "Naturaleza" AS ENUM ('DEUDORA', 'ACREEDORA');

-- CreateTable
CREATE TABLE "Cuenta" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "clase" INTEGER NOT NULL,
    "grupo" INTEGER,
    "cuenta" INTEGER,
    "subcuenta" INTEGER,
    "naturaleza" "Naturaleza" NOT NULL,
    "permiteMovimiento" BOOLEAN NOT NULL DEFAULT false,
    "afectaResultado" BOOLEAN NOT NULL DEFAULT false,
    "requiereTercero" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cuenta_codigo_key" ON "Cuenta"("codigo");

-- CreateIndex
CREATE INDEX "Cuenta_clase_grupo_idx" ON "Cuenta"("clase", "grupo");

-- CreateIndex
CREATE INDEX "Cuenta_nivel_idx" ON "Cuenta"("nivel");
