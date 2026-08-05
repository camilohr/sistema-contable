import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import { empresaDePrueba } from "./helpers.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["adminexp@test.local", "auxexp@test.local"];
let adminToken = "";
let auxToken = "";
let adminId = 0;
let cajaId = 0;
let ingresosId = 0;
let periodoId = 0;
let empresaId = "";

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

async function crearComprobante(fecha: string, concepto: string, estado: string) {
  const asientos = [
    { cuentaId: cajaId, debito: 100000, credito: 0 },
    { cuentaId: ingresosId, debito: 0, credito: 100000 },
  ];
  const consecutivo = (await prisma.comprobante.count({ where: { tipo: "DIARIO" } })) + 1;
  return prisma.comprobante.create({
    data: {
      tipo: "DIARIO",
      fecha: new Date(fecha),
      periodoId,
      concepto,
      estado,
      consecutivo,
      totalDebito: 100000,
      totalCredito: 100000,
      usuarioCreoId: adminId,
      asientos: { create: asientos },
    },
  });
}

interface RespuestaArchivo {
  body: unknown;
  text?: string;
}

function cuerpoBinario(res: RespuestaArchivo): Buffer {
  if (Buffer.isBuffer(res.body)) return res.body;
  return Buffer.from(res.text ?? "", "latin1");
}

function esPdf(res: RespuestaArchivo): boolean {
  const buf = cuerpoBinario(res);
  return buf.length > 800 && buf.subarray(0, 4).toString("latin1") === "%PDF";
}

function esZip(res: RespuestaArchivo): boolean {
  const buf = cuerpoBinario(res);
  return buf.subarray(0, 2).toString("latin1") === "PK";
}

function esXlsx(res: RespuestaArchivo): boolean {
  const buf = cuerpoBinario(res);
  return buf.length > 800 && buf.subarray(0, 4).toString("latin1") === "PK\x03\x04";
}

beforeAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  await prisma.usuario.create({ data: { nombre: "Admin Export", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "Aux Export", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email: emails[0] }, select: { id: true } })).id;
  adminToken = await login(emails[0], "clave123");
  auxToken = await login(emails[1], "clave123");

  empresaId = await empresaDePrueba();

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "4120"] } } });
  cajaId = cuentas.find((c) => c.codigo === "110505")!.id;
  ingresosId = cuentas.find((c) => c.codigo === "4120")!.id;

  const periodo = await prisma.periodo.create({
    data: { nombre: "2026-11", fechaInicio: new Date("2026-11-01"), fechaFin: new Date("2026-11-30") },
  });
  periodoId = periodo.id;

  await crearComprobante("2026-11-02", "Venta contada EXPORT", "CONTABILIZADO");
  await crearComprobante("2026-11-15", "Venta a credito EXPORT", "CONTABILIZADO");
  await crearComprobante("2026-11-20", "Borrador excluido EXPORT", "BORRADOR");
});

afterAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("PDFs nuevos de la Fase 4", () => {
  it("balance-general.pdf es un PDF válido", async () => {
    const res = await request(app).get(`/api/reportes/balance-general.pdf?periodoId=${periodoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(esPdf(res)).toBe(true);
  });

  it("estado-resultados.pdf es un PDF válido", async () => {
    const res = await request(app).get(`/api/reportes/estado-resultados.pdf?periodoId=${periodoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(esPdf(res)).toBe(true);
  });

  it("indicadores/:periodoId.pdf es un PDF válido", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoId}.pdf`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(esPdf(res)).toBe(true);
  });

  it("indicadores con periodo inexistente responde 400", async () => {
    const res = await request(app).get("/api/reportes/indicadores/999999.pdf").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("Exportación CSV/XLSX", () => {
  it("libro-diario.csv exporta con BOM y separador ;", async () => {
    const res = await request(app).get(`/api/reportes/libro-diario.csv?periodoId=${periodoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toContain(".csv");
    const texto = res.text ?? "";
    expect(texto.startsWith("\uFEFF")).toBe(true);
    expect(texto).toContain("Ref;Fecha;Concepto;Cuenta");
    expect(texto).toContain("Venta contada EXPORT");
    expect(texto).not.toContain("Borrador excluido EXPORT");
  });

  it("?formato=csv sobre el path JSON devuelve CSV", async () => {
    const res = await request(app).get(`/api/reportes/balance-general?formato=csv&periodoId=${periodoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
  });

  it("libro-mayor.xlsx es un XLSX válido", async () => {
    const res = await request(app).get(`/api/reportes/libro-mayor.xlsx?cuentaId=${cajaId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml/);
    expect(res.headers["content-disposition"]).toContain(".xlsx");
    expect(esXlsx(res)).toBe(true);
  });

  it("balance-general.xlsx es un XLSX válido", async () => {
    const res = await request(app).get(`/api/reportes/balance-general.xlsx?periodoId=${periodoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(esXlsx(res)).toBe(true);
  });

  it("indicadores/:periodoId.xlsx es un XLSX válido", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoId}.xlsx`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(esXlsx(res)).toBe(true);
  });
});

describe("Paquete ZIP de informes", () => {
  it("genera un ZIP con los PDFs del periodo", async () => {
    const res = await request(app)
      .post(`/api/empresas/${empresaId}/informes/paquete`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ periodoId });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/zip/);
    expect(res.headers["content-disposition"]).toContain(".zip");
    expect(esZip(res)).toBe(true);
    const buf = cuerpoBinario(res);
    expect(buf.includes("libro-diario.pdf")).toBe(true);
    expect(buf.includes("balance-general.pdf")).toBe(true);
    expect(buf.includes("indicadores.pdf")).toBe(true);
    expect(buf.includes("%PDF")).toBe(true);
  });

  it("rechaza una empresa distinta a la activa (403)", async () => {
    const res = await request(app).post("/api/empresas/empresa-incorrecta/informes/paquete").set("Authorization", `Bearer ${adminToken}`).send({ periodoId });
    expect(res.status).toBe(403);
  });

  it("AUXILIAR no puede generar el paquete (403)", async () => {
    const res = await request(app)
      .post(`/api/empresas/${empresaId}/informes/paquete`)
      .set("Authorization", `Bearer ${auxToken}`)
      .send({ periodoId });
    expect(res.status).toBe(403);
  });

  it("exige periodoId o anio (400)", async () => {
    const res = await request(app).post(`/api/empresas/${empresaId}/informes/paquete`).set("Authorization", `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(400);
  });
});


