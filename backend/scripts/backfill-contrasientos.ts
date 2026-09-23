import { prisma } from "../src/lib/prisma.js";
import { crearContrasiento } from "../src/lib/comprobantes.js";

async function run(): Promise<void> {
  const anulados = await prisma.comprobante.findMany({
    where: {
      estado: "ANULADO",
      comprobanteOrigenId: null,
      contrasientos: { none: {} },
    },
    include: { asientos: true },
  });

  if (anulados.length === 0) {
    console.log("Sin comprobantes ANULADO históricos por respaldar.");
    return;
  }

  let creados = 0;
  for (const c of anulados) {
    if (!c.usuarioAnuloId) {
      console.log(`Omitido ${c.id} (${c.tipo}-${c.consecutivo}): sin usuarioAnuloId`);
      continue;
    }
    const contra = await crearContrasiento(prisma, {
      origen: {
        id: c.id,
        empresaId: c.empresaId,
        tipo: c.tipo,
        consecutivo: c.consecutivo,
        fecha: c.fecha,
        periodoId: c.periodoId,
        terceroId: c.terceroId,
        concepto: c.concepto,
        totalDebito: c.totalDebito,
        totalCredito: c.totalCredito,
        asientos: c.asientos,
      },
      usuarioId: c.usuarioAnuloId,
    });
    creados++;
    console.log(`Contrasiento ${contra.id} (${contra.tipo}-${contra.consecutivo}) generado para el comprobante ${c.id} (${c.tipo}-${c.consecutivo})`);
  }
  console.log(`Backfill finalizado: ${creados} contrasiento(s) generado(s).`);
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});