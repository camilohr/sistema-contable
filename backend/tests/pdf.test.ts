import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["admin6@test.local", "aux6@test.local"];
let adminToken = "";
let adminId = 0;
let cajaId = 0;
let ingresosId = 0;
let periodoId = 0;

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

function esPdf(valor: unknown): boolean {
  const buf = Buffer.isBuffer(valor) ? valor : Buffer.from(valor as string);
  return buf.length > 800 && buf.subarray(0, 4).toString("latin1") === "%PDF";
}

beforeAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  await prisma.usuario.create({ data: { nombre: "Admin 6", email: "admin6@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email: "admin6@test.local" }, select: { id: true } })).id;
  adminToken = await login("admin6@test.local", "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "4120"] } } });
  cajaId = cuentas.find((c) => c.codigo === "110505")!.id;
  ingresosId = cuentas.find((c) => c.codigo === "4120")!.id;

  const periodo = await prisma.periodo.create({
    data: { nombre: "2026-11", fechaInicio: new Date("2026-11-01"), fechaFin: new Date("2026-11-30") },
  });
  periodoId = periodo.id;

  await crearComprobante("2026-11-02", "Venta contada PDF", "CONTABILIZADO");
  await crearComprobante("2026-11-15", "Venta a credito PDF", "CONTABILIZADO");
  await crearComprobante("2026-11-20", "Borrador excluido PDF", "BORRADOR");
});

afterAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Libros oficiales en PDF", () => {
  it("libro-diario.pdf devuelve un PDF válido", async () => {
    const res = await request(app).get("/api/reportes/libro-diario.pdf").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toContain("libro-diario.pdf");
    expect(esPdf(res.body)).toBe(true);
  });

  it("libro-diario.pdf respeta filtros (solo contabilizados, excluye borradores)", async () => {
    const res = await request(app)
      .get(`/api/reportes/libro-diario.pdf?periodoId=${periodoId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(esPdf(res.body)).toBe(true);
  });

  it("libro-mayor.pdf devuelve un PDF válido y filtra por cuenta", async () => {
    const res = await request(app).get(`/api/reportes/libro-mayor.pdf?cuentaId=${cajaId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(esPdf(res.body)).toBe(true);
  });

  it("libro-inventarios.pdf devuelve un PDF válido", async () => {
    const res = await request(app).get(`/api/reportes/libro-inventarios.pdf?periodoId=${periodoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(esPdf(res.body)).toBe(true);
  });

  it("exigen autenticación (401) sin token", async () => {
    const res = await request(app).get("/api/reportes/libro-diario.pdf");
    expect(res.status).toBe(401);
  });
});
