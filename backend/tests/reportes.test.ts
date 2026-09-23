import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["admin5@test.local", "aux5@test.local"];
let adminToken = "";
let auxToken = "";
let adminId = 0;

let cajaId = 0;
let bancoId = 0;
let ingresosId = 0;
let periodoId = 0;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

async function crearComprobante(opts: { tipo?: string; fecha: string; concepto: string; estado?: string; asientos: { cuentaId: number; debito?: number; credito?: number }[] }) {
  const asientos = opts.asientos.map((a) => ({ cuentaId: a.cuentaId, debito: a.debito ?? 0, credito: a.credito ?? 0 }));
  const totalDebito = asientos.reduce((s, a) => s + a.debito, 0);
  const totalCredito = asientos.reduce((s, a) => s + a.credito, 0);
  const consecutivo = (await prisma.comprobante.count({ where: { tipo: opts.tipo ?? "DIARIO" } })) + 1;
  return prisma.comprobante.create({
    data: {
      tipo: opts.tipo ?? "DIARIO",
      fecha: new Date(opts.fecha),
      periodoId,
      concepto: opts.concepto,
      estado: opts.estado ?? "BORRADOR",
      consecutivo,
      totalDebito,
      totalCredito,
      usuarioCreoId: adminId,
      asientos: { create: asientos },
    },
  });
}

beforeAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE5CC"] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  await prisma.usuario.create({ data: { nombre: "Admin 5", email: "admin5@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "Aux 5", email: "aux5@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email: "admin5@test.local" }, select: { id: true } })).id;
  adminToken = await login("admin5@test.local", "clave123");
  auxToken = await login("aux5@test.local", "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "111005", "4120"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cajaId = porCodigo.get("110505")!;
  bancoId = porCodigo.get("111005")!;
  ingresosId = porCodigo.get("4120")!;

  const periodo = await prisma.periodo.create({
    data: { nombre: "2026-10", fechaInicio: new Date("2026-10-01"), fechaFin: new Date("2026-10-31") },
  });
  periodoId = periodo.id;

  await crearComprobante({ fecha: "2026-10-02", concepto: "Venta A", estado: "CONTABILIZADO", asientos: [{ cuentaId: cajaId, debito: 100000 }, { cuentaId: ingresosId, credito: 100000 }] });
  await crearComprobante({ fecha: "2026-10-05", concepto: "Venta B", estado: "CONTABILIZADO", asientos: [{ cuentaId: bancoId, debito: 50000 }, { cuentaId: ingresosId, credito: 50000 }] });
  await crearComprobante({ fecha: "2026-10-08", concepto: "Borrador excluido", asientos: [{ cuentaId: cajaId, debito: 70000 }, { cuentaId: ingresosId, credito: 70000 }] });
  const anulado = await crearComprobante({ fecha: "2026-10-09", concepto: "Anulado excluido", estado: "CONTABILIZADO", asientos: [{ cuentaId: cajaId, debito: 90000 }, { cuentaId: ingresosId, credito: 90000 }] });
  const consecutivoContra = (await prisma.comprobante.count({ where: { tipo: "DIARIO" } })) + 1;
  await prisma.comprobante.create({
    data: {
      tipo: "DIARIO",
      consecutivo: consecutivoContra,
      fecha: new Date("2026-10-09"),
      periodoId,
      concepto: `Anulación de D-${String(anulado.consecutivo).padStart(4, "0")}: Anulado excluido`,
      estado: "CONTABILIZADO",
      totalDebito: 90000,
      totalCredito: 90000,
      usuarioCreoId: adminId,
      comprobanteOrigenId: anulado.id,
      asientos: { create: [{ cuentaId: cajaId, credito: 90000 }, { cuentaId: ingresosId, debito: 90000 }] },
    },
  });
});

afterAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE5CC"] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Libro diario", () => {
  it("incluye ANULADO y su contrasiento, con efecto neto cero", async () => {
    const res = await request(app).get("/api/reportes/libro-diario").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.numComprobantes).toBe(4);
    expect(res.body.numLineas).toBe(8);
    expect(res.body.lineas.some((l: { concepto: string }) => l.concepto.startsWith("Anulación de"))).toBe(true);
    expect(res.body.lineas.some((l: { concepto: string }) => l.concepto === "Anulado excluido")).toBe(true);
    expect(res.body.lineas.some((l: { concepto: string }) => l.concepto === "Borrador excluido")).toBe(false);
  });

  it("devuelve refs, cuentas y totales correctos", async () => {
    const res = await request(app).get("/api/reportes/libro-diario").set("Authorization", `Bearer ${adminToken}`);
    const caja = res.body.lineas.find((l: { codigoCuenta: string }) => l.codigoCuenta === "110505");
    expect(caja.debito).toBe(100000);
    expect(caja.credito).toBe(0);
    expect(caja.ref).toMatch(/^D-\d{4}$/);
    const cajaContra = res.body.lineas.find((l: { codigoCuenta: string; credito: number }) => l.codigoCuenta === "110505" && l.credito === 90000);
    expect(cajaContra).toBeDefined();
    expect(res.body.totalDebitos).toBe(330000);
    expect(res.body.totalCreditos).toBe(330000);
  });

  it("filtra por rango de fechas", async () => {
    const res = await request(app)
      .get("/api/reportes/libro-diario?fechaDesde=2026-10-05&fechaHasta=2026-10-05")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.numComprobantes).toBe(1);
    expect(res.body.numLineas).toBe(2);
  });

  it("filtra por periodo", async () => {
    const res = await request(app).get(`/api/reportes/libro-diario?periodoId=${periodoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.numComprobantes).toBe(4);
  });

  it("exige autenticación (401)", async () => {
    const res = await request(app).get("/api/reportes/libro-diario");
    expect(res.status).toBe(401);
  });
});

describe("Libro mayor", () => {
  it("agrupa por cuenta con saldo según naturaleza", async () => {
    const res = await request(app).get("/api/reportes/libro-mayor").set("Authorization", `Bearer ${adminToken}`);
    const caja = res.body.cuentas.find((c: { codigo: string }) => c.codigo === "110505");
    const ingresos = res.body.cuentas.find((c: { codigo: string }) => c.codigo === "4120");
    expect(caja.debitos).toBe(190000);
    expect(caja.creditos).toBe(90000);
    expect(caja.saldo).toBe(100000);
    expect(ingresos.debitos).toBe(90000);
    expect(ingresos.creditos).toBe(240000);
    expect(ingresos.saldo).toBe(150000);
    expect(res.body.totalDebitos).toBe(330000);
    expect(res.body.totalCreditos).toBe(330000);
  });

  it("filtra por cuenta", async () => {
    const res = await request(app).get(`/api/reportes/libro-mayor?cuentaId=${cajaId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.cuentas.length).toBe(1);
    expect(res.body.cuentas[0].codigo).toBe("110505");
  });

  it("accesible para AUXILIAR (solo lectura)", async () => {
    const res = await request(app).get("/api/reportes/libro-mayor").set("Authorization", `Bearer ${auxToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cuentas.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Balance de comprobación", () => {
  it("calcula sumas y saldos por cuenta", async () => {
    const res = await request(app).get("/api/reportes/balance-comprobacion").set("Authorization", `Bearer ${adminToken}`);
    const caja = res.body.cuentas.find((c: { codigo: string }) => c.codigo === "110505");
    const ingresos = res.body.cuentas.find((c: { codigo: string }) => c.codigo === "4120");
    expect(caja.saldoDeudor).toBe(100000);
    expect(caja.saldoAcreedor).toBe(0);
    expect(ingresos.saldoDeudor).toBe(0);
    expect(ingresos.saldoAcreedor).toBe(150000);
    expect(res.body.totalDebitos).toBe(330000);
    expect(res.body.totalCreditos).toBe(330000);
    expect(res.body.saldosDeudores).toBe(150000);
    expect(res.body.saldosAcreedores).toBe(150000);
  });

  it("cuadra: sumas iguales y saldos compensados", async () => {
    const res = await request(app).get("/api/reportes/balance-comprobacion").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.totalDebitos).toBe(res.body.totalCreditos);
    expect(res.body.saldosDeudores).toBe(res.body.saldosAcreedores);
  });

  it("exige autenticación (401)", async () => {
    const res = await request(app).get("/api/reportes/balance-comprobacion");
    expect(res.status).toBe(401);
  });
});
