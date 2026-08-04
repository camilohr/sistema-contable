/*
  Warnings:

  - You are about to alter the column `arlEmpleador` on the `Empleado` table. The data in that column could be lost. The data in that column will be cast from `Decimal(5,2)` to `Decimal(5,3)`.
  - You are about to alter the column `arlEmpleador` on the `ParametroNomina` table. The data in that column could be lost. The data in that column will be cast from `Decimal(5,2)` to `Decimal(5,3)`.

*/
-- AlterTable
ALTER TABLE "Empleado" ALTER COLUMN "arlEmpleador" SET DATA TYPE DECIMAL(5,3);

-- AlterTable
ALTER TABLE "ParametroNomina" ALTER COLUMN "arlEmpleador" SET DATA TYPE DECIMAL(5,3);
