import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const testEmails = ["test@test.local", "admin@test.local"];

beforeAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: testEmails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.usuario.create({
    data: { nombre: "Usuario Prueba", email: "test@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" },
  });
  await prisma.usuario.create({
    data: { nombre: "Admin Prueba", email: "admin@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" },
  });
});

afterAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: testEmails } } } });
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

describe("Cambio de contraseña obligatorio", () => {
  const email = "obligatoria@test.local";
  const password = "clave123";

  async function crearUsuarioConFlag() {
    await prisma.auditoria.deleteMany({ where: { usuario: { email } } });
    await prisma.usuario.deleteMany({ where: { email } });
    await prisma.usuario.create({
      data: { nombre: "Obligatoria", email, passwordHash: await bcrypt.hash(password, 10), rol: "CONTADOR", debeCambiarPassword: true },
    });
  }

  afterAll(async () => {
    await prisma.auditoria.deleteMany({ where: { usuario: { email } } });
    await prisma.usuario.deleteMany({ where: { email } });
  });

  it("login devuelve debeCambiarPassword", async () => {
    await crearUsuarioConFlag();
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.usuario.debeCambiarPassword).toBe(true);
  });

  it("bloquea el resto de la API con 403 hasta cambiar la contraseña", async () => {
    const login = await request(app).post("/api/auth/login").send({ email, password });
    const res = await request(app).get("/api/periodos").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe("DEBE_CAMBIAR_PASSWORD");
  });

  it("permite /api/auth/me mientras la contraseña está pendiente", async () => {
    const login = await request(app).post("/api/auth/login").send({ email, password });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });

  it("tras cambiar la contraseña se invalidan los tokens anteriores y se accede con la nueva", async () => {
    const login = await request(app).post("/api/auth/login").send({ email, password });
    const cambia = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ passwordActual: password, passwordNueva: "clave456" });
    expect(cambia.status).toBe(200);
    // M1: el token emitido con la contraseña vieja queda sin efecto.
    const conTokenViejo = await request(app).get("/api/periodos").set("Authorization", `Bearer ${login.body.token}`);
    expect(conTokenViejo.status).toBe(401);
    // Con la contraseña nueva se genera un token vigente.
    const loginNuevo = await request(app).post("/api/auth/login").send({ email, password: "clave456" });
    expect(loginNuevo.status).toBe(200);
    const res = await request(app).get("/api/periodos").set("Authorization", `Bearer ${loginNuevo.body.token}`);
    expect(res.status).toBe(200);
  });
});

describe("Empresas: /api/empresas", () => {
  it("no autenticado recibe 401", async () => {
    const res = await request(app).get("/api/empresas");
    expect(res.status).toBe(401);
  });

  it("listar devuelve las empresas del usuario autenticado", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "admin@test.local", password: "clave123" });
    const res = await request(app).get("/api/empresas").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const empresas = res.body as { id: string; nombre: string; rol: string }[];
    expect(empresas.length).toBeGreaterThan(0);
    expect(empresas[0].id).toBeTruthy();
    expect(empresas[0].rol).toBe("ADMIN");
  });

  it("listar no incluye empresas a las que no pertenece el usuario", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "test@test.local", password: "clave123" });
    const res = await request(app).get("/api/empresas").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.every((e: { rol: string }) => e.rol === "AUXILIAR")).toBe(true);
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
    await prisma.usuarioEmpresa.deleteMany({ where: { usuario: { email: "nuevo@test.local" } } });
    await prisma.usuario.deleteMany({ where: { email: "nuevo@test.local" } });
    const login = await request(app).post("/api/auth/login").send({ email: "admin@test.local", password: "clave123" });
    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ nombre: "Contador Nuevo", email: "nuevo@test.local", password: "clave123", rol: "CONTADOR" });
    expect(res.status).toBe(201);
    expect(res.body.rol).toBe("CONTADOR");
    await prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: res.body.id } });
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
