-- CreateEnum
CREATE TYPE "EstadoNomina" AS ENUM ('BORRADOR', 'CONTABILIZADO', 'ANULADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'CREAR_EMPLEADO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'EDITAR_EMPLEADO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'RETIRAR_EMPLEADO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'LIQUIDAR_NOMINA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'CONTABILIZAR_NOMINA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ANULAR_NOMINA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'PROVISIONAR_NOMINA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ACTUALIZAR_PARAMETROS_NOMINA';

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "terceroId" TEXT NOT NULL,
    "cargo" TEXT,
    "salarioBase" DECIMAL(15,2) NOT NULL,
    "fechaIngreso" DATE NOT NULL,
    "fechaRetiro" DATE,
    "ibcAjuste" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "arlEmpleador" DECIMAL(5,2) NOT NULL DEFAULT 0.522,
    "auxilioTransporteManual" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nomina" (
    "id" SERIAL NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "diasTrabajados" INTEGER NOT NULL DEFAULT 30,
    "sueldo" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "horasExtras" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "comisiones" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "bonificaciones" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "auxilioTransporte" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otrosDevengados" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "saludEmpleado" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pensionEmpleado" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "solidaridad" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "retefuente" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "libranzas" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "embargos" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otrosDescuentos" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ibc" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "aporteSalud" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "aportePension" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "aporteArl" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "aporteCaja" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "aporteIcbf" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "aporteSena" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalDevengado" DECIMAL(15,2) NOT NULL,
    "totalDeducciones" DECIMAL(15,2) NOT NULL,
    "netoPagar" DECIMAL(15,2) NOT NULL,
    "estado" "EstadoNomina" NOT NULL DEFAULT 'BORRADOR',
    "comprobanteId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisionNomina" (
    "id" SERIAL NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "baseCesantias" DECIMAL(15,2) NOT NULL,
    "cesantias" DECIMAL(15,2) NOT NULL,
    "interesesCesantias" DECIMAL(15,2) NOT NULL,
    "prima" DECIMAL(15,2) NOT NULL,
    "baseVacaciones" DECIMAL(15,2) NOT NULL,
    "vacaciones" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,
    "comprobanteId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisionNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametroNomina" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "smmlv" DECIMAL(15,2) NOT NULL,
    "auxilioTransporte" DECIMAL(15,2) NOT NULL,
    "topeAuxilioTransporteSalarios" DECIMAL(5,2) NOT NULL,
    "topeIbcSalarios" DECIMAL(5,2) NOT NULL,
    "saludEmpleado" DECIMAL(5,2) NOT NULL,
    "pensionEmpleado" DECIMAL(5,2) NOT NULL,
    "saludEmpleador" DECIMAL(5,2) NOT NULL,
    "pensionEmpleador" DECIMAL(5,2) NOT NULL,
    "arlEmpleador" DECIMAL(5,2) NOT NULL,
    "cajaCompensacion" DECIMAL(5,2) NOT NULL,
    "icbf" DECIMAL(5,2) NOT NULL,
    "sena" DECIMAL(5,2) NOT NULL,
    "umbralParafiscales" INTEGER NOT NULL,
    "solidaridadUmbralSalarios" DECIMAL(5,2) NOT NULL,
    "interesesCesantias" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametroNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametroCuentaNomina" (
    "id" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametroCuentaNomina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_terceroId_key" ON "Empleado"("terceroId");

-- CreateIndex
CREATE INDEX "Empleado_activo_idx" ON "Empleado"("activo");

-- CreateIndex
CREATE INDEX "Nomina_periodoId_estado_idx" ON "Nomina"("periodoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Nomina_empleadoId_periodoId_key" ON "Nomina"("empleadoId", "periodoId");

-- CreateIndex
CREATE INDEX "ProvisionNomina_periodoId_idx" ON "ProvisionNomina"("periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisionNomina_empleadoId_periodoId_key" ON "ProvisionNomina"("empleadoId", "periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroNomina_anio_key" ON "ParametroNomina"("anio");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroCuentaNomina_concepto_key" ON "ParametroCuentaNomina"("concepto");

-- CreateIndex
CREATE INDEX "ParametroCuentaNomina_cuentaId_idx" ON "ParametroCuentaNomina"("cuentaId");

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionNomina" ADD CONSTRAINT "ProvisionNomina_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionNomina" ADD CONSTRAINT "ProvisionNomina_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionNomina" ADD CONSTRAINT "ProvisionNomina_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametroCuentaNomina" ADD CONSTRAINT "ParametroCuentaNomina_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
