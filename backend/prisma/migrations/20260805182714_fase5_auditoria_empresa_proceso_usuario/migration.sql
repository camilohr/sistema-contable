-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'CREAR_EMPRESA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'EDITAR_EMPRESA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'DESACTIVAR_EMPRESA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ACTIVAR_EMPRESA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ASIGNAR_USUARIO_EMPRESA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'CAMBIAR_ROL_EMPRESA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'RETIRAR_USUARIO_EMPRESA';
ALTER TYPE "AccionAuditoria" ADD VALUE 'CREAR_PROCESO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ACTUALIZAR_PROCESO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ELIMINAR_PROCESO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'MARCAR_ACTIVIDAD';
ALTER TYPE "AccionAuditoria" ADD VALUE 'AGREGAR_NOTA';
