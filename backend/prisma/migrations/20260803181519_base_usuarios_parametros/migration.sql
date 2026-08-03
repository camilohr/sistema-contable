-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'CONTADOR', 'AUXILIAR');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'AUXILIAR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parametro" (
    "id" SERIAL NOT NULL,
    "nombreEmpresa" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "anioFiscalInicio" INTEGER NOT NULL DEFAULT 1,
    "mensajeRecibo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parametro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
