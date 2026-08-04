-- CreateEnum
CREATE TYPE "AccionAuditoria" AS ENUM ('CONTABILIZAR', 'ANULAR', 'ELIMINAR_COMPROBANTE', 'CERRAR_PERIODO', 'REABRIR_PERIODO', 'CREAR_USUARIO', 'CREAR_CUENTA', 'EDITAR_CUENTA', 'CREAR_ACTIVO', 'EDITAR_ACTIVO', 'DEPRECIAR_ACTIVOS', 'BAJA_ACTIVO');

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" SERIAL NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "accion" "AccionAuditoria" NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "detalle" JSONB,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_idx" ON "Auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "Auditoria_fecha_idx" ON "Auditoria"("fecha");

-- CreateIndex
CREATE INDEX "Auditoria_usuarioId_idx" ON "Auditoria"("usuarioId");

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
