import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { Prisma, AccionAuditoria } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import { empresaDePrueba } from "./helpers.js";
import { errorHandler } from "../src/middleware/error.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = [
  "fase3-admin@test.local",
  "fase3-cont@test.local",
  "fase3-otra@test.local",
  "fase3-libre@test.local",
];
const clave = "clave123";

let adminToken = "";
let contToken = "";
let empresaB = "";
let idAdmin = "";
let idCont = "";

beforeAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuarioEmpresa.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.empresa.deleteMany({ where: { nit: "777000001" } });

  const admin = await prisma.usuario.create({
    data: { nombre: "Fase3 Admin", email: emails[0], passwordHash: await bcrypt.hash(clave, 10), rol: "ADMIN" },
  });
  idAdmin = admin.id;
  adminToken = (await request(app).post("/api/auth/login").send({ email: emails[0], password: clave })).body.token;
  // vincularUsuarios enlazó al admin con la empresa de prueba; recuperamos su id.
  const vinculadosAdmin = await prisma.usuarioEmpresa.findMany({ where: { usuarioId: admin.id } });
  if (vinculadosAdmin.length === 0) {
    await prisma.usuarioEmpresa.create({ data: { usuarioId: admin.id, empresaId: await empresaDePrueba(), rol: "ADMIN" } });
  }

  const cont = await prisma.usuario.create({
    data: { nombre: "Fase3 Contador", email: emails[1], passwordHash: await bcrypt.hash(clave, 10), rol: "CONTADOR" },
  });
  idCont = cont.id;
  // usuario sin vínculo alguno (queda "disponible"); inactivo para que la auto-unión no lo toque.
  await prisma.usuario.create({
    data: { nombre: "Fase3 Libre", email: emails[3], passwordHash: await bcrypt.hash(clave, 10), rol: "AUXILIAR", activo: false },
  });
  const otra = await prisma.usuario.create({
    data: { nombre: "Fase3 Otra", email: emails[2], passwordHash: await bcrypt.hash(clave, 10), rol: "CONTADOR" },
  });
  empresaB = (await prisma.empresa.create({ data: { nombre: "Empresa Fase3 B", nit: "777000001" } })).id;
  // cont y otra tienen vínculo SOLO con B.
  await prisma.usuarioEmpresa.create({ data: { usuarioId: cont.id, empresaId: empresaB, rol: "CONTADOR" } });
  await prisma.usuarioEmpresa.create({ data: { usuarioId: otra.id, empresaId: empresaB, rol: "CONTADOR" } });
});

afterAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.empresa.deleteMany({ where: { id: empresaB } });
  await prisma.usuarioEmpresa.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("M2: auditoría de login (LOGIN_OK / LOGIN_FALLIDO / CAMBIAR_PASSWORD) con IP", () => {
  it("login exitoso registra LOGIN_OK sin empresa", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: emails[2], password: clave });
    expect(res.status).toBe(200);
    const reg = await prisma.auditoria.findFirst({
      where: { accion: "LOGIN_OK", usuario: { email: emails[2] } },
      orderBy: { id: "desc" },
    });
    expect(reg).toBeTruthy();
    expect(reg!.empresaId).toBeNull();
    expect(typeof (reg!.detalle as { ip?: string }).ip).toBe("string");
  });

  it("login fallido registra LOGIN_FALLIDO con IP y ruta", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: emails[2], password: "mal" });
    expect(res.status).toBe(401);
    const reg = await prisma.auditoria.findFirst({
      where: { accion: "LOGIN_FALLIDO", usuario: { email: emails[2] } },
      orderBy: { id: "desc" },
    });
    expect(reg).toBeTruthy();
    const detalle = reg!.detalle as { ip?: string; ruta?: string };
    expect(typeof detalle.ip).toBe("string");
    expect(detalle.ruta).toBe("/api/auth/login");
  });

  it("cambiar contraseña registra CAMBIAR_PASSWORD y también cierra la sesión anterior", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: emails[1], password: clave });
    expect(login.status).toBe(200);
    contToken = login.body.token;
    const cambia = await request(app)
      .post("/api/auth/cambiar-password")
      .set("Authorization", `Bearer ${contToken}`)
      .send({ passwordActual: clave, passwordNueva: "clave456" });
    expect(cambia.status).toBe(200);
    const reg = await prisma.auditoria.findFirst({
      where: { accion: "CAMBIAR_PASSWORD", usuario: { email: emails[1] } },
      orderBy: { id: "desc" },
    });
    expect(reg).toBeTruthy();
    expect(typeof (reg!.detalle as { ip?: string }).ip).toBe("string");
    // el token de la sesión anterior queda invalidado (M1: tokenVersion)
    const viejo = await request(app)
      .get("/api/periodos")
      .set("Authorization", `Bearer ${contToken}`)
      .set("x-empresa-id", empresaB);
    expect(viejo.status).toBe(401);
    contToken = (await request(app).post("/api/auth/login").send({ email: emails[1], password: "clave456" })).body.token;
    expect(typeof contToken).toBe("string");
  });
});

describe("A1: guards de enums y enteros — 400 para valores inválidos", () => {
  it("GET /api/comprobantes?tipo=abc → 400", async () => {
    const res = await request(app).get("/api/comprobantes?tipo=abc").set("Authorization", `Bearer ${contToken}`);
    expect(res.status).toBe(400);
  });
  it("GET /api/comprobantes?estado=abc → 400", async () => {
    const res = await request(app).get("/api/comprobantes?estado=abc").set("Authorization", `Bearer ${contToken}`);
    expect(res.status).toBe(400);
  });
  it("GET /api/comprobantes?periodoId=abc → 400", async () => {
    const res = await request(app).get("/api/comprobantes?periodoId=abc").set("Authorization", `Bearer ${contToken}`);
    expect(res.status).toBe(400);
  });
  it("GET /api/adjuntos?entidad=abc → 400", async () => {
    const res = await request(app).get("/api/adjuntos?entidad=abc").set("Authorization", `Bearer ${contToken}`);
    expect(res.status).toBe(400);
  });
  it("exportación: periodoId/cuentaId no enteros → 400", async () => {
    const res1 = await request(app).get("/api/reportes/indicadores/abc.xlsx").set("Authorization", `Bearer ${contToken}`);
    expect(res1.status).toBe(400);
    const res2 = await request(app)
      .get("/api/reportes/libro-mayor.csv?cuentaId=abc")
      .set("Authorization", `Bearer ${contToken}`);
    expect(res2.status).toBe(400);
  });
});

describe("M4: eventos globales (empresaId null) solo para ADMIN global", () => {
  it("el ADMIN de la empresa A ve sus eventos y los globales, pero no los del cliente B", async () => {
    const empresaA = await empresaDePrueba();
    // piso directamente: un evento del cliente B, propio de A y global
    await prisma.auditoria.create({
      data: {
        usuarioId: idCont,
        empresaId: empresaB,
        accion: AccionAuditoria.CREAR_CUENTA,
        entidad: "Cuenta",
        entidadId: "fix-b",
        detalle: {},
      },
    });
    await prisma.auditoria.create({
      data: {
        usuarioId: idAdmin,
        empresaId: empresaA,
        accion: AccionAuditoria.EDITAR_CUENTA,
        entidad: "Cuenta",
        entidadId: "fix-a",
        detalle: {},
      },
    });
    // separados: login exitoso (empresaId null) — global
    await prisma.auditoria.create({
      data: {
        usuarioId: idCont,
        empresaId: null,
        accion: AccionAuditoria.LOGIN_OK,
        entidad: "Usuario",
        entidadId: idCont,
        detalle: { ip: "10.0.0.9" },
      },
    });

    const res = await request(app)
      .get("/api/auditoria")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-empresa-id", empresaA);
    expect(res.status).toBe(200);
    const registros = res.body as { accion: string; entidadId?: string }[];
    // ve sus propios eventos (empresaId = A)
    expect(registros.find((r) => r.accion === "EDITAR_CUENTA" && r.entidadId === "fix-a")).toBeTruthy();
    // ve eventos globales (empresaId null)
    expect(registros.find((r) => r.accion === "LOGIN_OK" && r.entidadId === idCont)).toBeTruthy();
    // NO ve eventos del cliente B
    expect(registros.find((r) => r.accion === "CREAR_CUENTA" && r.entidadId === "fix-b")).toBeUndefined();
  });

  it("un no-ADMIN no puede consultar la bitácora global (403)", async () => {
    const res = await request(app)
      .get("/api/auditoria")
      .set("Authorization", `Bearer ${contToken}`)
      .set("x-empresa-id", empresaB);
    expect(res.status).toBe(403);
  });
});

describe("M5: /usuarios/disponibles no expone usuarios de otros tenants", () => {
  it("excluye a usuarios vinculados a otras empresas y muestra a los sin vínculo", async () => {
    const res = await request(app)
      .get("/api/usuarios/disponibles")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-empresa-id", await empresaDePrueba());
    expect(res.status).toBe(200);
    const disponibles = (res.body as { email: string }[]).map((u) => u.email);
    // el usuario sin vínculos (inactivo, no auto-enlazado) sí es candidato
    expect(disponibles).toContain(emails[3]);
    // los usuarios de otras empresas NO deben aparecer
    expect(disponibles).not.toContain(emails[1]);
    expect(disponibles).not.toContain(emails[2]);
    // el admin (ya vinculado a A) tampoco debe aparecer
    expect(disponibles).not.toContain(emails[0]);
  });
});

describe("M3: errores internos no filtran detalles y llevan errorId", () => {
  const mini = express();
  mini.get("/boom", () => {
    throw new Error("secreto-de-bd: contrasena=x");
  });
  mini.get("/p2002", () => {
    throw new Prisma.PrismaClientKnownRequestError("duplicado", {
      code: "P2002",
      clientVersion: Prisma.prismaVersion.client,
      meta: { target: ["email"] },
    });
  });
  mini.get("/cuatrocientos", () => {
    const e = new Error("Solicitud inválida explícita") as Error & { status: number };
    e.status = 400;
    throw e;
  });
  mini.use(errorHandler);

  it("500 responde genérico + errorId sin filtrar el mensaje", async () => {
    const res = await request(mini).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Error interno del servidor");
    expect(typeof res.body.errorId).toBe("string");
    expect(res.body.errorId.length).toBeGreaterThan(10);
    expect(JSON.stringify(res.body)).not.toContain("secreto-de-bd");
  });

  it("P2002 mapea a 409 con el campo duplicado", async () => {
    const res = await request(mini).get("/p2002");
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("email");
  });

  it("errores 4xx explícitos se devuelven tal cual", async () => {
    const res = await request(mini).get("/cuatrocientos");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Solicitud inválida explícita");
  });
});