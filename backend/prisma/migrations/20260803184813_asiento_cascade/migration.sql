-- DropForeignKey
ALTER TABLE "Asiento" DROP CONSTRAINT "Asiento_comprobanteId_fkey";

-- AddForeignKey
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
