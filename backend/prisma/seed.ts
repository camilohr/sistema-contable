import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";
import { PUC } from "./puc.js";
import { derivarPuc } from "../src/lib/puc.js";

async function importarPuc(): Promise<void> {
  const codes = new Set(PUC.map(([c]) => c));
  const esHoja = (codigo: string) =>
    ![...codes].some((c) => c.length > codigo.length && c.startsWith(codigo));

  let creadas = 0;
  for (const [codigo, nombre] of PUC) {
    const derivado = derivarPuc(codigo);
    const cuenta = await prisma.cuenta.upsert({
      where: { codigo },
      update: { nombre },
      create: {
        codigo,
        nombre,
        permiteMovimiento: esHoja(codigo),
        ...derivado,
      },
    });
    if (cuenta.createdAt.getTime() === cuenta.updatedAt.getTime()) creadas += 1;
  }
  console.log(`PUC importado: ${PUC.length} cuentas (${creadas} nuevas).`);
}

async function seedUsuarioAdmin(): Promise<void> {
  const adminEmail = "admin@sistema.local";
  const admin = await prisma.usuario.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const passwordHash = await bcrypt.hash("Admin123!", 10);
    await prisma.usuario.create({
      data: { nombre: "Administrador", email: adminEmail, passwordHash, rol: "ADMIN", debeCambiarPassword: true },
    });
    console.log("Usuario administrador creado: admin@sistema.local / Admin123!  (deberá cambiar la contraseña en el primer ingreso)");
  } else {
    console.log("El usuario administrador ya existe.");
  }
}

async function seedParametros(): Promise<void> {
  const parametros = await prisma.parametro.count();
  if (parametros === 0) {
    await prisma.parametro.create({
      data: { nombreEmpresa: "Mi Empresa", nit: "000000000" },
    });
    console.log("Parámetros iniciales creados.");
  }
}

async function main(): Promise<void> {
  await seedUsuarioAdmin();
  await seedParametros();
  await importarPuc();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
