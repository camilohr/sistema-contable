import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["resumen-admin@test.local", "resumen-cont@test.local"];
const suf = Date.now();

let adminId = "";
let adminToken = "";
let periodoId = 0;
let cajaId = 0;
let ingresosId = 0;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  await prisma.procesoContable.deleteMany({});
  const idsPrevios = (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: idsPrevios } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `RES-${suf}` } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: `RES-${suf}` } } });

  const admin = await prisma.usuario.create({ data: { nombre: "Resumen Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  const contador = await prisma.usuario.create({ data: { nombre: "Resumen Contador", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" } });
  adminId = admin.id;
  adminToken = await login(emails[0], "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "4120"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cajaId = porCodigo.get("110505")!;
  ingresosId = porCodigo.get("4120")!;

  const periodo = await prisma.periodo.create({
    data: { nombre: `RES-${suf}-2099-12`, fechaInicio: new Date("2099-12-01"), fechaFin: new Date("2099-12-31") },
  });
  periodoId = periodo.id;

  const borrador = await request(app)
    .post("/api/comprobantes")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ tipo: "DIARIO", fecha: "2099-12-10", periodoId, concepto: `RES-${suf}-borrador`, asientos: [{ cuentaId: cajaId, debito: 1000 }, { cuentaId: ingresosId, credito: 1000 }] });
  expect(borrador.status).toBe(201);

  const contabilizado = await request(app)
    .post("/api/comprobantes")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ tipo: "DIARIO", fecha: "2099-12-11", periodoId, concepto: `RES-${suf}-contabilizado`, asientos: [{ cuentaId: cajaId, debito: 2000 }, { cuentaId: ingresosId, credito: 2000 }] });
  expect(contabilizado.status).toBe(201);
  const cont = await request(app).post(`/api/comprobantes/${contabilizado.body.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`);
  expect(cont.status).toBe(200);

  const proceso = await request(app).post("/api/procesos").set("Authorization", `Bearer ${adminToken}`).send({ anio: 2099 });
  expect(proceso.status).toBe(201);
});

afterAll(async () => {
  await prisma.procesoContable.deleteMany({});
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: `RES-${suf}` } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `RES-${suf}` } } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId] } } });
  const ids = (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Resumen por empresa: validaciones", () => {
  it("no autenticado recibe 401", async () => {
    const res = await request(app).get("/api/resumen");
    expect(res.status).toBe(401);
  });

  it("el periodo objetivo es el más reciente", async () => {
    const res = await request(app).get("/api/resumen").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.periodoObjetivo).toEqual({
      id: periodoId,
      nombre: `RES-${suf}-2099-12`,
      anio: 2099,
    });
  });
});

describe("Resumen por empresa: estado consolidado", () => {
  it("expone el proceso del año del periodo objetivo con su avance", async () => {
    const res = await request(app).get("/api/resumen").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.proceso.anio).toBe(2099);
    expect(res.body.proceso.avance.total).toBe(7);
    expect(res.body.proceso.avance.porcentaje).toBeGreaterThanOrEqual(0);
    expect(res.body.cierreAnio).toEqual({ anio: 2099, cerrado: false });
  });

  it("cuenta comprobantes borrador y contabilizados", async () => {
    const res = await request(app).get("/api/resumen").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.comprobantes.borradores).toBeGreaterThanOrEqual(1);
    expect(res.body.comprobantes.contabilizados).toBeGreaterThanOrEqual(1);
  });

  it("reporta periodos abiertos y no abiertos vencidos en el objetivo", async () => {
    const res = await request(app).get("/api/resumen").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.periodos.abiertos).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.periodos.vencidos).toBe("number");
  });

  it("el último periodo sin nómina, provisión ni presupuesto lo reporta", async () => {
    const res = await request(app).get("/api/resumen").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.nomina).toEqual({ contabilizada: false, periodoId });
    expect(res.body.provision).toEqual({ calculada: false, periodoId });
    expect(res.body.presupuesto).toEqual({ cargado: false, periodoId, partidas: 0 });
  });

  it("incluye el conteo de alertas por severidad", async () => {
    const res = await request(app).get("/api/resumen").set("Authorization", `Bearer ${adminToken}`);
    expect(typeof res.body.alertas.total).toBe("number");
    expect(typeof res.body.alertas.altas).toBe("number");
    expect(typeof res.body.alertas.medias).toBe("number");
    expect(typeof res.body.alertas.bajas).toBe("number");
    expect(res.body.alertas.total).toBe(res.body.alertas.altas + res.body.alertas.medias + res.body.alertas.bajas);
  });

  it("incluye los datos de la empresa activa", async () => {
    const res = await request(app).get("/api/resumen").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.empresa.id).toBeTruthy();
    expect(res.body.empresa.nombre).toBeTruthy();
  });
});
