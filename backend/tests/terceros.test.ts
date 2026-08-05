import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["admin3@test.local", "aux3@test.local"];
let adminToken = "";
let auxToken = "";

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.tercero.deleteMany({ where: { documento: { in: ["79808071", "900123456", "900123456-1", "AB123456", "79999999", "79999998"] } } });
  await prisma.usuario.create({ data: { nombre: "Admin 3", email: "admin3@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "Aux 3", email: "aux3@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminToken = await login("admin3@test.local", "clave123");
  auxToken = await login("aux3@test.local", "clave123");
});

afterAll(async () => {
  await prisma.tercero.deleteMany({ where: { documento: { in: ["79808071", "900123456", "900123456-1", "AB123456", "79999999", "79999998"] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Creación de terceros", () => {
  it("crea un cliente persona natural con CC", async () => {
    const res = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipo: "CLIENTE", tipoDocumento: "CC", documento: "79808071", nombreRazonSocial: "Juan Pérez" });
    expect(res.status).toBe(201);
    expect(res.body.tipoDocumento).toBe("CC");
    expect(res.body.activo).toBe(true);
  });

  it("crea un proveedor con NIT y dígito de verificación", async () => {
    const res = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipo: "PROVEEDOR", tipoDocumento: "NIT", documento: "900123456-1", nombreRazonSocial: "Comercial XYZ SAS" });
    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe("PROVEEDOR");
  });

  it("rechaza documento inválido para el tipo (400)", async () => {
    const res = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipoDocumento: "CC", documento: "123", nombreRazonSocial: "Cédula corta" });
    expect(res.status).toBe(400);
  });

  it("rechaza duplicado con mismo tipo de documento (409)", async () => {
    const res = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipoDocumento: "CC", documento: "79808071", nombreRazonSocial: "Duplicado" });
    expect(res.status).toBe(409);
  });

  it("permite el mismo número como NIT y como CC", async () => {
    const res = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipoDocumento: "NIT", documento: "79808071", nombreRazonSocial: "Persona con NIT" });
    expect(res.status).toBe(201);
  });

  it("rechaza email mal formado (400)", async () => {
    const res = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipoDocumento: "CC", documento: "79999999", nombreRazonSocial: "Correo malo", email: "correo-invalido" });
    expect(res.status).toBe(400);
  });

  it("rechaza a AUXILIAR crear terceros (403)", async () => {
    const res = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${auxToken}`)
      .send({ tipoDocumento: "CC", documento: "79999998", nombreRazonSocial: "No autorizado" });
    expect(res.status).toBe(403);
  });
});

describe("Listado de terceros", () => {
  it("lista los terceros creados", async () => {
    const res = await request(app).get("/api/terceros").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it("filtra por tipo", async () => {
    const res = await request(app).get("/api/terceros?tipo=PROVEEDOR").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((t: { tipo: string }) => t.tipo === "PROVEEDOR")).toBe(true);
  });

  it("busca por nombre o documento", async () => {
    const res = await request(app).get("/api/terceros?busqueda=Juan").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.some((t: { nombreRazonSocial: string }) => t.nombreRazonSocial === "Juan Pérez")).toBe(true);
    const resDoc = await request(app).get("/api/terceros?busqueda=900123456").set("Authorization", `Bearer ${adminToken}`);
    expect(resDoc.body.some((t: { documento: string }) => t.documento === "900123456-1")).toBe(true);
  });

  it("deniega sin token (401)", async () => {
    const res = await request(app).get("/api/terceros");
    expect(res.status).toBe(401);
  });
});

describe("Actualización y desactivación", () => {
  it("actualiza datos de un tercero", async () => {
    const creado = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipoDocumento: "CE", documento: "AB123456", nombreRazonSocial: "Extranjero" });
    const res = await request(app)
      .patch(`/api/terceros/${creado.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombreRazonSocial: "Extranjero S.A.S", ciudad: "Medellín", telefono: "6044444444" });
    expect(res.status).toBe(200);
    expect(res.body.nombreRazonSocial).toBe("Extranjero S.A.S");
    expect(res.body.ciudad).toBe("Medellín");
    await prisma.tercero.delete({ where: { id: creado.body.id } });
  });

  it("rechaza duplicado al actualizar documento (409)", async () => {
    const creado = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipoDocumento: "CC", documento: "79999999", nombreRazonSocial: "Temporal" });
    const res = await request(app)
      .patch(`/api/terceros/${creado.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ documento: "79808071" });
    expect(res.status).toBe(409);
    await prisma.tercero.delete({ where: { id: creado.body.id } });
  });

  it("desactiva un tercero de forma lógica", async () => {
    const creado = await request(app)
      .post("/api/terceros")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tipoDocumento: "CC", documento: "79999998", nombreRazonSocial: "A desactivar" });
    const res = await request(app).delete(`/api/terceros/${creado.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const enBD = await prisma.tercero.findUnique({ where: { id: creado.body.id } });
    expect(enBD?.activo).toBe(false);
    const soloActivos = await request(app).get("/api/terceros?soloActivos=true").set("Authorization", `Bearer ${adminToken}`);
    expect(soloActivos.body.some((t: { id: string }) => t.id === creado.body.id)).toBe(false);
    await prisma.tercero.delete({ where: { id: creado.body.id } });
  });
});
