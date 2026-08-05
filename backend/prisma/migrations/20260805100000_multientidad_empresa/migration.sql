-- Multientidad Fase 1: Empresa, UsuarioEmpresa y scope de empresa en tablas directas.
-- El PUC, ParametroProvision y ParametroNomina quedan como catálogo/base general (empresaId NULL).
-- Los datos existentes se asignan al cliente 1 (Empresa creada desde Parametro).

-- CreateEnum
CREATE TYPE "RolEmpresa" AS ENUM ('ADMIN', 'CONTADOR', 'AUXILIAR');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "anioFiscalInicio" INTEGER NOT NULL DEFAULT 1,
    "mensajeRecibo" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioEmpresa" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "rol" "RolEmpresa" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsuarioEmpresa_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (Empresa ya existe)
ALTER TABLE "UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropIndex (viejos; se recrean con scope de empresa)
DROP INDEX "ActivoFijo_estado_idx";
DROP INDEX "Auditoria_entidad_entidadId_idx";
DROP INDEX "CierreAnual_anio_key";
DROP INDEX "Comprobante_fecha_idx";
DROP INDEX "Comprobante_periodoId_idx";
DROP INDEX "Comprobante_tipo_consecutivo_key";
DROP INDEX "Cuenta_codigo_key";
DROP INDEX "CuentaPorCobrar_estado_idx";
DROP INDEX "CuentaPorCobrar_terceroId_idx";
DROP INDEX "CuentaPorPagar_estado_idx";
DROP INDEX "CuentaPorPagar_terceroId_idx";
DROP INDEX "ParametroCuentaNomina_concepto_key";
DROP INDEX "ParametroNomina_anio_key";
DROP INDEX "ParametroProvision_diasDesde_diasHasta_key";
DROP INDEX "Periodo_nombre_key";
DROP INDEX "Producto_activo_idx";
DROP INDEX "Producto_codigo_key";
DROP INDEX "Tercero_tipoDocumento_documento_key";
DROP INDEX "Tercero_tipo_idx";

-- AlterTable: agregar empresaId como nullable para poder hacer backfill
ALTER TABLE "ActivoFijo" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "Auditoria" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "CierreAnual" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "Comprobante" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "Consecutivo" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "Cuenta" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "CuentaPorCobrar" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "CuentaPorPagar" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "ParametroCuentaNomina" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "ParametroNomina" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "ParametroProvision" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "Periodo" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "Producto" ADD COLUMN     "empresaId" TEXT;
ALTER TABLE "Tercero" ADD COLUMN     "empresaId" TEXT;

-- Backfill: crear la Empresa del cliente 1 a partir de Parametro (o por defecto si no existe)
INSERT INTO "Empresa" ("id", "nombre", "nit", "direccion", "telefono", "moneda", "anioFiscalInicio", "mensajeRecibo", "activa", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text)::uuid::text,
  COALESCE((SELECT "nombreEmpresa" FROM "Parametro" LIMIT 1), 'Empresa actual'),
  COALESCE((SELECT "nit" FROM "Parametro" LIMIT 1), '000000000'),
  (SELECT "direccion" FROM "Parametro" LIMIT 1),
  (SELECT "telefono" FROM "Parametro" LIMIT 1),
  COALESCE((SELECT "moneda" FROM "Parametro" LIMIT 1), 'COP'),
  COALESCE((SELECT "anioFiscalInicio" FROM "Parametro" LIMIT 1), 1),
  (SELECT "mensajeRecibo" FROM "Parametro" LIMIT 1),
  true,
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM "Empresa");

-- Backfill: asignar los datos existentes al cliente 1
UPDATE "ActivoFijo" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "CierreAnual" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "Comprobante" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "Consecutivo" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "CuentaPorCobrar" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "CuentaPorPagar" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "ParametroCuentaNomina" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "Periodo" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "Producto" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "Tercero" SET "empresaId" = (SELECT "id" FROM "Empresa" LIMIT 1) WHERE "empresaId" IS NULL;

-- Backfill: vincular cada usuario con el cliente 1 usando su rol global
INSERT INTO "UsuarioEmpresa" ("id", "usuarioId", "empresaId", "rol", "activo", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || "id")::uuid::text,
  "id",
  (SELECT "id" FROM "Empresa" LIMIT 1),
  "rol"::text::"RolEmpresa",
  "activo",
  now(),
  now()
FROM "Usuario"
WHERE NOT EXISTS (SELECT 1 FROM "UsuarioEmpresa");

-- AlterTable: hacer NOT NULL las columnas obligatorias y reestructurar PK de Consecutivo
ALTER TABLE "Consecutivo" DROP CONSTRAINT "Consecutivo_pkey";
ALTER TABLE "ActivoFijo" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "CierreAnual" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "Comprobante" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "Consecutivo" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "CuentaPorCobrar" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "CuentaPorPagar" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "ParametroCuentaNomina" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "Periodo" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "Producto" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "Tercero" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "Consecutivo" ADD CONSTRAINT "Consecutivo_pkey" PRIMARY KEY ("empresaId", "tipo");

-- DropTable: Parametro queda absorbido por Empresa
DROP TABLE "Parametro";

-- CreateIndex
CREATE INDEX "Empresa_activa_idx" ON "Empresa"("activa");
CREATE INDEX "UsuarioEmpresa_empresaId_idx" ON "UsuarioEmpresa"("empresaId");
CREATE UNIQUE INDEX "UsuarioEmpresa_usuarioId_empresaId_key" ON "UsuarioEmpresa"("usuarioId", "empresaId");
CREATE INDEX "ActivoFijo_empresaId_estado_idx" ON "ActivoFijo"("empresaId", "estado");
CREATE INDEX "Auditoria_empresaId_entidad_entidadId_idx" ON "Auditoria"("empresaId", "entidad", "entidadId");
CREATE UNIQUE INDEX "CierreAnual_empresaId_anio_key" ON "CierreAnual"("empresaId", "anio");
CREATE INDEX "Comprobante_empresaId_periodoId_idx" ON "Comprobante"("empresaId", "periodoId");
CREATE INDEX "Comprobante_empresaId_fecha_idx" ON "Comprobante"("empresaId", "fecha");
CREATE UNIQUE INDEX "Comprobante_empresaId_tipo_consecutivo_key" ON "Comprobante"("empresaId", "tipo", "consecutivo");
CREATE UNIQUE INDEX "Cuenta_empresaId_codigo_key" ON "Cuenta"("empresaId", "codigo");
CREATE INDEX "CuentaPorCobrar_empresaId_terceroId_idx" ON "CuentaPorCobrar"("empresaId", "terceroId");
CREATE INDEX "CuentaPorCobrar_empresaId_estado_idx" ON "CuentaPorCobrar"("empresaId", "estado");
CREATE INDEX "CuentaPorPagar_empresaId_terceroId_idx" ON "CuentaPorPagar"("empresaId", "terceroId");
CREATE INDEX "CuentaPorPagar_empresaId_estado_idx" ON "CuentaPorPagar"("empresaId", "estado");
CREATE UNIQUE INDEX "ParametroCuentaNomina_empresaId_concepto_key" ON "ParametroCuentaNomina"("empresaId", "concepto");
CREATE UNIQUE INDEX "ParametroNomina_empresaId_anio_key" ON "ParametroNomina"("empresaId", "anio");
CREATE UNIQUE INDEX "ParametroProvision_empresaId_diasDesde_diasHasta_key" ON "ParametroProvision"("empresaId", "diasDesde", "diasHasta");
CREATE UNIQUE INDEX "Periodo_empresaId_nombre_key" ON "Periodo"("empresaId", "nombre");
CREATE INDEX "Producto_empresaId_activo_idx" ON "Producto"("empresaId", "activo");
CREATE UNIQUE INDEX "Producto_empresaId_codigo_key" ON "Producto"("empresaId", "codigo");
CREATE INDEX "Tercero_empresaId_tipo_idx" ON "Tercero"("empresaId", "tipo");
CREATE UNIQUE INDEX "Tercero_empresaId_tipoDocumento_documento_key" ON "Tercero"("empresaId", "tipoDocumento", "documento");

-- AddForeignKey
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tercero" ADD CONSTRAINT "Tercero_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Periodo" ADD CONSTRAINT "Periodo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consecutivo" ADD CONSTRAINT "Consecutivo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivoFijo" ADD CONSTRAINT "ActivoFijo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CierreAnual" ADD CONSTRAINT "CierreAnual_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParametroProvision" ADD CONSTRAINT "ParametroProvision_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParametroNomina" ADD CONSTRAINT "ParametroNomina_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParametroCuentaNomina" ADD CONSTRAINT "ParametroCuentaNomina_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
