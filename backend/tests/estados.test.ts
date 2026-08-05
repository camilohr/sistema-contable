import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const email = "admin6@test.local";
let token = "";
let adminId = 0;
let periodoId = 0;

let caja = 0;
let inventario = 0;
let proveedores = 0;
let capital = 0;
let iva = 0;
let ingresos = 0;
let costoVentas = 0;
let gastos = 0;

async function login(): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: "clave123" });
  return res.body.token;
}

async function crearComprobante(opts: { fecha: string; concepto: string; asientos: { cuentaId: number; debito?: number; credito?: number }[] }) {
  const asientos = opts.asientos.map((a) => ({ cuentaId: a.cuentaId, debito: a.debito ?? 0, credito: a.credito ?? 0 }));
  return prisma.comprobante.create({
    data: {
      tipo: "DIARIO",
      fecha: new Date(opts.fecha),
      periodoId,
      concepto: opts.concepto,
      estado: "CONTABILIZADO",
      consecutivo: (await prisma.comprobante.count({ where: { tipo: "DIARIO" } })) + 1,
      totalDebito: asientos.reduce((s, a) => s + a.debito, 0),
      totalCredito: asientos.reduce((s, a) => s + a.credito, 0),
      usuarioCreoId: adminId,
      asientos: { create: asientos },
    },
  });
}

beforeAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE6CC"] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });
  await prisma.consecutivo.deleteMany({});

  await prisma.usuario.create({ data: { nombre: "Admin 6", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  token = await login();

  const cuentas = await prisma.cuenta.findMany({
    where: { codigo: { in: ["110505", "1405", "220505", "3105", "240805", "4120", "6135", "510505"] } },
  });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  caja = porCodigo.get("110505")!;
  inventario = porCodigo.get("1405")!;
  proveedores = porCodigo.get("220505")!;
  capital = porCodigo.get("3105")!;
  iva = porCodigo.get("240805")!;
  ingresos = porCodigo.get("4120")!;
  costoVentas = porCodigo.get("6135")!;
  gastos = porCodigo.get("510505")!;

  const periodo = await prisma.periodo.create({
    data: { nombre: "2026-11", fechaInicio: new Date("2026-11-01"), fechaFin: new Date("2026-11-30") },
  });
  periodoId = periodo.id;

  await crearComprobante({ fecha: "2026-11-01", concepto: "Aporte inicial", asientos: [{ cuentaId: caja, debito: 10000000 }, { cuentaId: capital, credito: 10000000 }] });
  await crearComprobante({ fecha: "2026-11-02", concepto: "Compra mercancía", asientos: [{ cuentaId: inventario, debito: 2000000 }, { cuentaId: proveedores, credito: 2000000 }] });
  await crearComprobante({ fecha: "2026-11-03", concepto: "Venta", asientos: [{ cuentaId: caja, debito: 1190000 }, { cuentaId: ingresos, credito: 1000000 }, { cuentaId: iva, credito: 190000 }] });
  await crearComprobante({ fecha: "2026-11-04", concepto: "Costo de venta", asientos: [{ cuentaId: costoVentas, debito: 600000 }, { cuentaId: inventario, credito: 600000 }] });
  await crearComprobante({ fecha: "2026-11-05", concepto: "Sueldos", asientos: [{ cuentaId: gastos, debito: 200000 }, { cuentaId: caja, credito: 200000 }] });
});

afterAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE6CC"] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });
  await prisma.consecutivo.deleteMany({});
  await prisma.$disconnect();
});

describe("Balance general", () => {
  it("calcula saldos de activo, pasivo y patrimonio", async () => {
    const res = await request(app).get(`/api/reportes/balance-general?periodoId=${periodoId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const cajaRes = res.body.activo.flatMap((g: { cuentas: unknown[] }) => g.cuentas).find((c: { codigo: string }) => c.codigo === "110505");
    expect(cajaRes.saldo).toBe(10990000);
    const inventarioRes = res.body.activo.flatMap((g: { cuentas: unknown[] }) => g.cuentas).find((c: { codigo: string }) => c.codigo === "1405");
    expect(inventarioRes.saldo).toBe(1400000);
    const pasivoRes = res.body.pasivo.flatMap((g: { cuentas: unknown[] }) => g.cuentas);
    expect(pasivoRes.reduce((s: number, c: { saldo: number }) => s + c.saldo, 0)).toBe(2190000);
  });

  it("incluye el resultado del ejercicio en patrimonio y cuadra la ecuación", async () => {
    const res = await request(app).get(`/api/reportes/balance-general?periodoId=${periodoId}`).set("Authorization", `Bearer ${token}`);
    expect(res.body.totalActivo).toBe(12390000);
    expect(res.body.totalPasivo).toBe(2190000);
    expect(res.body.resultado).toBe(200000);
    const resultado = res.body.patrimonio.find((g: { grupo: string }) => g.grupo === "99");
    expect(resultado.total).toBe(200000);
    expect(res.body.totalPatrimonio).toBe(10200000);
    expect(res.body.ecuacionOK).toBe(true);
  });

  it("excluye borradores y anulados", async () => {
    await crearComprobante({ fecha: "2026-11-06", concepto: "Borrador", asientos: [{ cuentaId: caja, debito: 1000000 }, { cuentaId: capital, credito: 1000000 }] });
    await prisma.comprobante.updateMany({ where: { concepto: "Borrador" }, data: { estado: "BORRADOR" } });
    const res = await request(app).get(`/api/reportes/balance-general?periodoId=${periodoId}`).set("Authorization", `Bearer ${token}`);
    expect(res.body.totalActivo).toBe(12390000);
  });
});

describe("Estado de resultados", () => {
  it("calcula ingresos, costos, gastos y resultado", async () => {
    const res = await request(app).get(`/api/reportes/estado-resultados?periodoId=${periodoId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalIngresos).toBe(1000000);
    expect(res.body.totalCostos).toBe(600000);
    expect(res.body.totalGastos).toBe(200000);
    expect(res.body.resultado).toBe(200000);
  });

  it("agrupa por grupo PUC", async () => {
    const res = await request(app).get(`/api/reportes/estado-resultados?periodoId=${periodoId}`).set("Authorization", `Bearer ${token}`);
    const operacionales = res.body.ingresos.find((g: { grupo: string }) => g.grupo === "41");
    expect(operacionales.total).toBe(1000000);
    const admin = res.body.gastos.find((g: { grupo: string }) => g.grupo === "51");
    expect(admin.total).toBe(200000);
  });

  it("exige autenticación (401)", async () => {
    const res = await request(app).get(`/api/reportes/balance-general?periodoId=${periodoId}`);
    expect(res.status).toBe(401);
  });
});
