import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Prisma, EstadoComprobante } from "@prisma/client";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["ind-admin@test.local", "ind-aux@test.local"];
const suf = Date.now();
const PREFIX = `INDIC-${suf}`;

let adminId = "";
let adminToken = "";
let auxiliarToken = "";
let cuenta: Record<string, number> = {};
let periodoA = 0;
let periodoB = 0;
let periodoVacio = 0;

const CUENTAS = ["110505", "130505", "146005", "220505", "3105", "410505", "510505", "610505"];
const DIARIO_BASE = 500000 + (suf % 100000);

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

let consecutivo = DIARIO_BASE;

async function crearDiario(periodoId: number, concepto: string, fecha: string, asientos: { codigo: string; debito?: number; credito?: number }[]) {
  consecutivo += 1;
  let totalDebito = new Prisma.Decimal(0);
  let totalCredito = new Prisma.Decimal(0);
  for (const a of asientos) {
    if (a.debito) totalDebito = totalDebito.plus(a.debito);
    if (a.credito) totalCredito = totalCredito.plus(a.credito);
  }
  return prisma.comprobante.create({
    data: {
      tipo: "DIARIO",
      consecutivo,
      fecha: new Date(fecha),
      periodoId,
      concepto,
      totalDebito,
      totalCredito,
      estado: EstadoComprobante.CONTABILIZADO,
      usuarioCreoId: adminId,
      asientos: {
        create: asientos.map((a) => ({
          cuentaId: cuenta[a.codigo],
          debito: a.debito ?? 0,
          credito: a.credito ?? 0,
          detalle: null,
        })),
      },
    },
  });
}

beforeAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id) } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: PREFIX } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: PREFIX } } });

  const admin = await prisma.usuario.create({ data: { nombre: "Ind Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  const auxiliar = await prisma.usuario.create({ data: { nombre: "Ind Auxiliar", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminId = admin.id;
  adminToken = await login(emails[0], "clave123");
  auxiliarToken = await login(emails[1], "clave123");

  const cuentasDb = await prisma.cuenta.findMany({ where: { codigo: { in: CUENTAS } }, select: { codigo: true, id: true } });
  const faltantes = CUENTAS.filter((c) => !cuentasDb.some((x) => x.codigo === c));
  if (faltantes.length) throw new Error(`Faltan cuentas PUC ${faltantes.join(",")} (ejecutar npm run db:seed)`);
  cuenta = Object.fromEntries(cuentasDb.map((c) => [c.codigo, c.id]));

  const crearPeriodo = (nombre: string, mes: string) =>
    prisma.periodo.create({ data: { nombre, fechaInicio: new Date(`2026-${mes}-01`), fechaFin: new Date(`2026-${mes}-28`) } });

  const pa = await crearPeriodo(`${PREFIX}-01`, "01");
  const pb = await crearPeriodo(`${PREFIX}-02`, "02");
  const pv = await crearPeriodo(`${PREFIX}-03`, "03");
  periodoA = pa.id;
  periodoB = pb.id;
  periodoVacio = pv.id;

  // Periodo A: activo corriente 12.080.000, pasivo 1.000.000, patrimonio 10.000.000
  await crearDiario(pa.id, `${PREFIX} aporte A`, "2026-01-05", [
    { codigo: "110505", debito: 10000000 },
    { codigo: "3105", credito: 10000000 },
  ]);
  await crearDiario(pa.id, `${PREFIX} venta A`, "2026-01-10", [
    { codigo: "130505", debito: 2380000 },
    { codigo: "410505", credito: 2380000 },
  ]);
  await crearDiario(pa.id, `${PREFIX} compra A`, "2026-01-15", [
    { codigo: "146005", debito: 1000000 },
    { codigo: "220505", credito: 1000000 },
  ]);
  await crearDiario(pa.id, `${PREFIX} gasto A`, "2026-01-20", [
    { codigo: "510505", debito: 500000 },
    { codigo: "110505", credito: 500000 },
  ]);
  await crearDiario(pa.id, `${PREFIX} costo A`, "2026-01-25", [
    { codigo: "610505", debito: 800000 },
    { codigo: "146005", credito: 800000 },
  ]);

  // Periodo B
  await crearDiario(pb.id, `${PREFIX} aporte B`, "2026-02-05", [
    { codigo: "110505", debito: 2000000 },
    { codigo: "3105", credito: 2000000 },
  ]);
  await crearDiario(pb.id, `${PREFIX} venta B`, "2026-02-10", [
    { codigo: "130505", debito: 2500000 },
    { codigo: "410505", credito: 2500000 },
  ]);
  await crearDiario(pb.id, `${PREFIX} compra B`, "2026-02-15", [
    { codigo: "146005", debito: 1200000 },
    { codigo: "220505", credito: 1200000 },
  ]);
  await crearDiario(pb.id, `${PREFIX} gasto B`, "2026-02-20", [
    { codigo: "510505", debito: 400000 },
    { codigo: "110505", credito: 400000 },
  ]);
  await crearDiario(pb.id, `${PREFIX} costo B`, "2026-02-25", [
    { codigo: "610505", debito: 700000 },
    { codigo: "146005", credito: 700000 },
  ]);
});

afterAll(async () => {
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: PREFIX } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: PREFIX } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
});

describe("Indicadores financieros - acceso y validación", () => {
  it("requiere autenticación", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoA}`);
    expect(res.status).toBe(401);
  });

  it("rechaza periodoId no numérico", async () => {
    const res = await request(app).get("/api/reportes/indicadores/abc").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("devuelve 404 si el periodo no existe", async () => {
    const res = await request(app).get("/api/reportes/indicadores/999999999").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Indicadores financieros - periodo individual", () => {
  it("calcula los datos agregados del periodo A", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoA}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.periodo.id).toBe(periodoA);
    const d = res.body.datos;
    expect(d.activoCorriente).toBe(12080000);
    expect(d.activoTotal).toBe(12080000);
    expect(d.pasivoCorriente).toBe(1000000);
    expect(d.pasivoTotal).toBe(1000000);
    expect(d.patrimonio).toBe(10000000);
    expect(d.inventario).toBe(200000);
    expect(d.cartera).toBe(2380000);
    expect(d.ingresos).toBe(2380000);
    expect(d.ventas).toBe(2380000);
    expect(d.costoVentas).toBe(800000);
    expect(d.gastos).toBe(500000);
    expect(d.utilidadNeta).toBe(1080000);
  });

  it("calcula las razones del periodo A", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoA}`).set("Authorization", `Bearer ${adminToken}`);
    const r = res.body.razones;
    expect(r.razonCorriente).toBe(12.08);
    expect(r.pruebaAcida).toBe(11.88);
    expect(r.endeudamiento).toBe(0.08);
    expect(r.margenNeto).toBe(0.45);
    expect(r.rotacionCartera).toBe(1);
    expect(r.rotacionInventario).toBe(4);
  });

  it("calcula las razones del periodo B", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoB}`).set("Authorization", `Bearer ${adminToken}`);
    const r = res.body.razones;
    expect(r.razonCorriente).toBe(3.83);
    expect(r.pruebaAcida).toBe(3.42);
    expect(r.endeudamiento).toBe(0.26);
    expect(r.margenNeto).toBe(0.56);
    expect(r.rotacionCartera).toBe(1);
    expect(r.rotacionInventario).toBe(1.4);
  });

  it("está disponible para cualquier rol autenticado", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoA}`).set("Authorization", `Bearer ${auxiliarToken}`);
    expect(res.status).toBe(200);
  });

  it("un periodo sin movimientos devuelve razones nulas y datos en cero", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoVacio}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const v of Object.values(res.body.razones)) expect(v).toBeNull();
    for (const v of Object.values(res.body.datos)) expect(v).toBe(0);
  });
});

describe("Indicadores financieros - comparativo", () => {
  it("requiere los parámetros desde y hasta", async () => {
    const res = await request(app).get("/api/reportes/indicadores/comparativo").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("devuelve 404 si un periodo no existe", async () => {
    const res = await request(app)
      .get(`/api/reportes/indicadores/comparativo?desde=${periodoA}&hasta=999999999`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("calcula razones con rotaciones usando saldos promedio", async () => {
    const res = await request(app)
      .get(`/api/reportes/indicadores/comparativo?desde=${periodoA}&hasta=${periodoB}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.periodos.desde.id).toBe(periodoA);
    expect(res.body.periodos.hasta.id).toBe(periodoB);
    expect(res.body.razones.desde.rotacionCartera).toBe(1);
    expect(res.body.razones.hasta.rotacionCartera).toBe(1.02);
    expect(res.body.razones.hasta.rotacionInventario).toBe(2);
    expect(res.body.razones.hasta.razonCorriente).toBe(3.83);
  });

  it("genera análisis vertical por sección con porcentajes", async () => {
    const res = await request(app)
      .get(`/api/reportes/indicadores/comparativo?desde=${periodoA}&hasta=${periodoB}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const activo = res.body.vertical.find((s: { seccion: string }) => s.seccion === "Activo");
    expect(activo).toBeDefined();
    expect(activo.totalDesde).toBe(12080000);
    expect(activo.totalHasta).toBe(4600000);
    const bancos = activo.filas.find((f: { codigo: string }) => f.codigo === "110505");
    expect(bancos.saldoDesde).toBe(9500000);
    expect(bancos.saldoHasta).toBe(1600000);
    expect(bancos.pctDesde).toBeCloseTo(78.64, 2);
    expect(bancos.pctHasta).toBeCloseTo(34.78, 2);
    const inventarios = activo.filas.find((f: { codigo: string }) => f.codigo === "146005");
    expect(inventarios.pctDesde).toBeCloseTo(1.66, 2);
    expect(inventarios.pctHasta).toBeCloseTo(10.87, 2);
  });

  it("genera análisis horizontal con variación absoluta y porcentual", async () => {
    const res = await request(app)
      .get(`/api/reportes/indicadores/comparativo?desde=${periodoA}&hasta=${periodoB}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const filas = res.body.horizontal as { seccion: string; nombre: string; desde: number; hasta: number; variacion: number; variacionPct: number | null }[];
    const activoTotal = filas.find((f) => f.nombre === "Activo (total)");
    expect(activoTotal).toBeDefined();
    expect(activoTotal!.desde).toBe(12080000);
    expect(activoTotal!.hasta).toBe(4600000);
    expect(activoTotal!.variacion).toBe(-7480000);
    expect(activoTotal!.variacionPct).toBeCloseTo(-61.92, 2);
    const utilidad = filas.find((f) => f.nombre === "Utilidad del ejercicio");
    expect(utilidad).toBeDefined();
    expect(utilidad!.desde).toBe(1080000);
    expect(utilidad!.hasta).toBe(1400000);
    expect(utilidad!.variacion).toBe(320000);
    expect(utilidad!.variacionPct).toBeCloseTo(29.63, 2);
  });

  it("un periodo vacío no contamina el comparativo", async () => {
    const res = await request(app)
      .get(`/api/reportes/indicadores/comparativo?desde=${periodoVacio}&hasta=${periodoVacio}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vertical).toHaveLength(0);
    expect(res.body.horizontal).toHaveLength(0);
    for (const v of Object.values(res.body.razones.desde)) expect(v).toBeNull();
  });
});
