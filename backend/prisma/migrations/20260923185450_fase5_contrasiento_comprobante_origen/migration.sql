-- AlterTable
ALTER TABLE "Comprobante" ADD COLUMN     "comprobanteOrigenId" INTEGER;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_comprobanteOrigenId_fkey" FOREIGN KEY ("comprobanteOrigenId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
