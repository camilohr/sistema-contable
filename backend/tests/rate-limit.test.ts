import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";
import { login } from "../src/controllers/auth.controller.js";
import { createLoginLimiter } from "../src/middleware/rateLimit.js";

const email = "rate-limit@test.com";
const password = "clave123";

function appConLimite(limit: number) {
  const app = express();
  app.use(express.json());
  app.post("/api/auth/login", createLoginLimiter({ limit, skipApp: false }), login);
  return app;
}

beforeAll(async () => {
  await prisma.usuario.deleteMany({ where: { email } });
  await prisma.usuario.create({
    data: { nombre: "Rate Limit", email, passwordHash: await bcrypt.hash(password, 10), rol: "AUXILIAR" },
  });
});

afterAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuario: { email } } });
  await prisma.usuario.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("límite de intentos de login", () => {
  it("devuelve 429 al superar el límite de intentos y registra LOGIN_BLOQUEADO en auditoría", async () => {
    const app = appConLimite(2);
    await prisma.auditoria.deleteMany({ where: { accion: "LOGIN_BLOQUEADO", usuario: { email } } });

    const primero = await request(app).post("/api/auth/login").send({ email, password });
    expect(primero.status).toBe(200);

    const segundo = await request(app).post("/api/auth/login").send({ email, password });
    expect(segundo.status).toBe(200);

    const bloqueado = await request(app).post("/api/auth/login").send({ email, password });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toContain("intentos");

    const auditoria = await prisma.auditoria.findFirst({
      where: { accion: "LOGIN_BLOQUEADO", usuario: { email } },
    });
    expect(auditoria).toBeTruthy();
  });

  it("el límite es por IP+email: emails distintos no comparten contador", async () => {
    const app = appConLimite(2);

    await request(app).post("/api/auth/login").send({ email, password });
    await request(app).post("/api/auth/login").send({ email: "rate-limit-otro@test.com", password: password });

    const ok = await request(app).post("/api/auth/login").send({ email, password });
    expect(ok.status).toBe(200);
  });
});