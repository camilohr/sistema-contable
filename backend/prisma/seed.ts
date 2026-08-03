import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  const adminEmail = "admin@sistema.local";
  const admin = await prisma.usuario.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const passwordHash = await bcrypt.hash("Admin123!", 10);
    await prisma.usuario.create({
      data: { nombre: "Administrador", email: adminEmail, passwordHash, rol: "ADMIN" },
    });
    console.log("Usuario administrador creado: admin@sistema.local / Admin123!  (¡cámbialo en el primer ingreso!)");
  } else {
    console.log("El usuario administrador ya existe.");
  }

  const parametros = await prisma.parametro.count();
  if (parametros === 0) {
    await prisma.parametro.create({
      data: { nombreEmpresa: "Mi Empresa", nit: "000000000" },
    });
    console.log("Parámetros iniciales creados.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
