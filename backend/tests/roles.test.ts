import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["roles-auxiliar@test.local", "roles-contador@test.local"];

async function tokenDe(email: string) {
  const login = await request(app).post("/api/auth/login").send({ email, password: "clave123" });
  return login.body.token as string;
}

beforeAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.usuario.create({
    data: { nombre: "Roles Auxiliar", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" },
  });
  await prisma.usuario.create({
    data: { nombre: "Roles Contador", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" },
  });
});

afterAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

const rutasEscritura: { path: string; metodo: "post" | "patch" | "delete" }[] = [
  { path: "/api/periodos", metodo: "post" },
  { path: "/api/cuentas", metodo: "post" },
  { path: "/api/terceros", metodo: "post" },
  { path: "/api/comprobantes", metodo: "post" },
  { path: "/api/productos", metodo: "post" },
  { path: "/api/cxc", metodo: "post" },
  { path: "/api/cxp", metodo: "post" },
  { path: "/api/periodos/1", metodo: "patch" },
  { path: "/api/periodos/1", metodo: "delete" },
  { path: "/api/cuentas/1", metodo: "patch" },
  // DELETE /api/cuentas/1 se excluye: id=1 es cuenta PUC nacional (empresaId=null),
  // ahora protegida con 403 por S3-05, no por control de rol.
  { path: "/api/terceros/1", metodo: "patch" },
  { path: "/api/terceros/1", metodo: "delete" },
  { path: "/api/productos/1", metodo: "patch" },
  { path: "/api/productos/1", metodo: "delete" },
  { path: "/api/productos/1/movimientos", metodo: "post" },
  { path: "/api/cxc/1", metodo: "patch" },
  { path: "/api/cxc/1", metodo: "delete" },
  { path: "/api/cxc/1/recibos", metodo: "post" },
  { path: "/api/cxp/1", metodo: "patch" },
  { path: "/api/cxp/1", metodo: "delete" },
  { path: "/api/cxp/1/pagos", metodo: "post" },
  { path: "/api/comprobantes/1", metodo: "patch" },
  { path: "/api/comprobantes/1/contabilizar", metodo: "post" },
  { path: "/api/comprobantes/1/anular", metodo: "post" },
  { path: "/api/comprobantes/1", metodo: "delete" },
];

describe("Escritura bloqueada para AUXILIAR (403)", () => {
  it.each(rutasEscritura)("$metodo $path -> 403", async ({ path, metodo }) => {
    const token = await tokenDe(emails[0]);
    const res = await request(app)[metodo](path).set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });
});

describe("Escritura permitida para CONTADOR (rol ok, falla validación)", () => {
  it.each(rutasEscritura)("$metodo $path no devuelve 403", async ({ path, metodo }) => {
    const token = await tokenDe(emails[1]);
    const res = await request(app)[metodo](path).set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).not.toBe(403);
  });
});

describe("Lectura permitida para AUXILIAR", () => {
  it.each(["/api/periodos", "/api/cuentas", "/api/terceros", "/api/comprobantes", "/api/productos", "/api/cxc", "/api/cxp"])(
    "GET %s -> 200",
    async (path) => {
      const token = await tokenDe(emails[0]);
      const res = await request(app).get(path).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  );
});
