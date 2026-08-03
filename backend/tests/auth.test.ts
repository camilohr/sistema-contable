import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import bcrypt from "bcryptjs";

const app = createApp();

const testEmails = ["test@test.local", "admin@test.local"];

beforeAll(async () => {
  await prisma.usuario.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.usuario.create({
    data: { nombre: "Usuario Prueba", email: "test@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" },
  });
  await prisma.usuario.create({
    data: { nombre: "Admin Prueba", email: "admin@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" },
  });
});

afterAll(async () => {
  await prisma.usuario.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.$disconnect();
});

describe("POST /api/auth/login", () => {
  it("inicia sesión correctamente y devuelve token", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "test@test.local", password: "clave123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.usuario.email).toBe("test@test.local");
  });

  it("rechaza contraseña incorrecta (401)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "test@test.local", password: "mal" });
    expect(res.status).toBe(401);
  });

  it("rechaza usuario inexistente (401)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nadie@test.local", password: "clave123" });
    expect(res.status).toBe(401);
  });

  it("rechaza usuario inactivo (401)", async () => {
    await prisma.usuario.update({ where: { email: "test@test.local" }, data: { activo: false } });
    const res = await request(app).post("/api/auth/login").send({ email: "test@test.local", password: "clave123" });
    expect(res.status).toBe(401);
    await prisma.usuario.update({ where: { email: "test@test.local" }, data: { activo: true } });
  });

  it("rechaza cuerpo inválido (400)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "no-es-un-email" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  it("accede con token válido", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "test@test.local", password: "clave123" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("test@test.local");
  });

  it("deniega acceso sin token (401)", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("deniega acceso con token inválido (401)", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer token-invalido");
    expect(res.status).toBe(401);
  });
});

describe("Roles en /api/usuarios", () => {
  it("ADMIN puede listar usuarios (200)", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "admin@test.local", password: "clave123" });
    const res = await request(app).get("/api/usuarios").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("AUXILIAR no puede listar usuarios (403)", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "test@test.local", password: "clave123" });
    const res = await request(app).get("/api/usuarios").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });

  it("solo ADMIN puede crear usuarios (201)", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "admin@test.local", password: "clave123" });
    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ nombre: "Contador Nuevo", email: "nuevo@test.local", password: "clave123", rol: "CONTADOR" });
    expect(res.status).toBe(201);
    expect(res.body.rol).toBe("CONTADOR");
    await prisma.usuario.delete({ where: { email: "nuevo@test.local" } });
  });

  it("AUXILIAR no puede crear usuarios (403)", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "test@test.local", password: "clave123" });
    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ nombre: "X", email: "x@test.local", password: "clave123", rol: "CONTADOR" });
    expect(res.status).toBe(403);
  });
});
