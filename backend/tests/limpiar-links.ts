import { prisma } from "../src/lib/prisma.js";

export default async function main(): Promise<void> {
  await prisma.usuarioEmpresa.deleteMany({});
  await prisma.$disconnect();
}

main();
