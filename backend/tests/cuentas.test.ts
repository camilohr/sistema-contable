import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["admin2@test.local", "aux2@test.local", "pwd@test.local"];
let adminToken = "";
let auxToken = "";

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.usuario.create({ data: { nombre: "Admin 2", email: "admin2@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "Aux 2", email: "aux2@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  await prisma.usuario.create({ data: { nombre: "Pwd", email: "pwd@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  adminToken = await login("admin2@test.local", "clave123");
  auxToken = await login("aux2@test.local", "clave123");
});

afterAll(async () => {
  await prisma.cuenta.deleteMany({ where: { codigo: { in: ["11050501", "11050502", "11050503"] } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("GET /api/cuentas", () => {
  it("lista el catálogo completo del PUC", async () => {
    const res = await request(app).get("/api/cuentas").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(800);
  });

  it("filtra por clase", async () => {
    const res = await request(app).get("/api/cuentas?clase=4").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((c: { clase: number }) => c.clase === 4)).toBe(true);
  });

  it("busca por texto", async () => {
    const res = await request(app).get("/api/cuentas?busqueda=caja").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((c: { codigo: string }) => c.codigo === "110505")).toBe(true);
  });

  it("lista solo cuentas de movimiento", async () => {
    const res = await request(app).get("/api/cuentas?soloMovimiento=true").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((c: { permiteMovimiento: boolean }) => c.permiteMovimiento)).toBe(true);
  });

  it("deniega sin token (401)", async () => {
    const res = await request(app).get("/api/cuentas");
    expect(res.status).toBe(401);
  });
});

describe("Creación de cuentas", () => {
  it("crea una subcuenta hija válida", async () => {
    const res = await request(app)
      .post("/api/cuentas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "11050501", nombre: "Caja general - sucursal norte" });
    expect(res.status).toBe(201);
    expect(res.body.nivel).toBe(5);
  });

  it("rechaza código con longitud inválida (400)", async () => {
    const res = await request(app)
      .post("/api/cuentas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "11050", nombre: "Inválido" });
    expect(res.status).toBe(400);
  });

  it("rechaza cuenta sin padre existente (400)", async () => {
    const res = await request(app)
      .post("/api/cuentas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "999901", nombre: "Sin padre" });
    expect(res.status).toBe(400);
  });

  it("rechaza código duplicado (409)", async () => {
    const res = await request(app)
      .post("/api/cuentas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "1105", nombre: "Caja duplicada" });
    expect(res.status).toBe(409);
  });

  it("rechaza a AUXILIAR crear cuentas (403)", async () => {
    const res = await request(app)
      .post("/api/cuentas")
      .set("Authorization", `Bearer ${auxToken}`)
      .send({ codigo: "11050502", nombre: "No autorizado" });
    expect(res.status).toBe(403);
  });
});

describe("Actualización y eliminación", () => {
  it("actualiza el nombre de una cuenta", async () => {
    const creada = await request(app)
      .post("/api/cuentas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "11050502", nombre: "Temporal" });
    const res = await request(app)
      .patch(`/api/cuentas/${creada.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Temporal 2", activa: false });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe("Temporal 2");
    expect(res.body.activa).toBe(false);
    await prisma.cuenta.delete({ where: { id: creada.body.id } });
  });

  it("elimina una cuenta hoja sin movimientos", async () => {
    const creada = await request(app)
      .post("/api/cuentas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "11050503", nombre: "Hija a eliminar" });
    const res = await request(app).delete(`/api/cuentas/${creada.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const inexistente = await request(app).get(`/api/cuentas?busqueda=11050503`).set("Authorization", `Bearer ${adminToken}`);
    expect(inexistente.body.length).toBe(0);
  });

  it("no permite eliminar cuenta con subcuentas (400)", async () => {
    const padre = await prisma.cuenta.findFirst({ where: { codigo: "1105" } });
    const res = await request(app).delete(`/api/cuentas/${padre!.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("Cambio de contraseña", () => {
  it("cambia la contraseña con la actual correcta", async () => {
    const token = await login("pwd@test.local", "clave123");
    const res = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ passwordActual: "clave123", passwordNueva: "nueva456" });
    expect(res.status).toBe(200);
    const nuevoLogin = await request(app).post("/api/auth/login").send({ email: "pwd@test.local", password: "nueva456" });
    expect(nuevoLogin.status).toBe(200);
  });

  it("rechaza contraseña actual incorrecta (400)", async () => {
    const token = await login("pwd@test.local", "nueva456");
    const res = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ passwordActual: "incorrecta", passwordNueva: "otra123" });
    expect(res.status).toBe(400);
  });

  it("rechaza contraseña nueva muy corta (400)", async () => {
    const token = await login("pwd@test.local", "nueva456");
    const res = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ passwordActual: "nueva456", passwordNueva: "abc" });
    expect(res.status).toBe(400);
  });
});
