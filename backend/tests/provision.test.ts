import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";
import { EstadoComprobante } from "@prisma/client";

const app = createApp();

const emails = ["prov-admin@test.local", "prov-cont@test.local", "prov-aux@test.local"];
const suf = Date.now();

let adminId = "";
let contadorId = "";
let auxiliarId = "";
let adminToken = "";
let contadorToken = "";
let auxiliarToken = "";

let clienteId = "";
let periodoA = 0; // 2026-08
let periodoB = 0; // 2026-09
let periodoC = 0; // 2026-10
let periodoCerrado = 0;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

function calcular(periodoId: number, token: string) {
  return request(app).post(`/api/cartera/provision/calcular/${periodoId}`).set("Authorization", `Bearer ${token}`);
}

const PARAMETROS_DEFECTO = [
  { diasDesde: 1, diasHasta: 30, porcentaje: 1 },
  { diasDesde: 31, diasHasta: 60, porcentaje: 5 },
  { diasDesde: 61, diasHasta: 90, porcentaje: 10 },
  { diasDesde: 91, diasHasta: null, porcentaje: 20 },
];

async function restaurarParametros(): Promise<void> {
  await prisma.parametroProvision.deleteMany({});
  await prisma.parametroProvision.createMany({
    data: PARAMETROS_DEFECTO.map((p) => ({ diasDesde: p.diasDesde, diasHasta: p.diasHasta, porcentaje: p.porcentaje })),
  });
}

beforeAll(async () => {
  const idsPrevios = (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: idsPrevios } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  await prisma.provisionCartera.deleteMany({});
  await prisma.parametroProvision.deleteMany({});
  await prisma.cuentaPorCobrar.deleteMany({});
  await prisma.cuentaPorPagar.deleteMany({});
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Provisión" } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Reversión de provisión" } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `PROV-${suf}` } } });
  await prisma.tercero.deleteMany({ where: { documento: `PROV-${suf}` } });

  const admin = await prisma.usuario.create({ data: { nombre: "Prov Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  adminId = admin.id;
  const contador = await prisma.usuario.create({ data: { nombre: "Prov Contador", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" } });
  contadorId = contador.id;
  const auxiliar = await prisma.usuario.create({ data: { nombre: "Prov Auxiliar", email: emails[2], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  auxiliarId = auxiliar.id;
  adminToken = await login(emails[0], "clave123");
  contadorToken = await login(emails[1], "clave123");
  auxiliarToken = await login(emails[2], "clave123");

  await restaurarParametros();

  const cliente = await prisma.tercero.create({
    data: { tipo: "CLIENTE", tipoDocumento: "CC", documento: `PROV-${suf}`, nombreRazonSocial: "Cliente Provisión" },
  });
  clienteId = cliente.id;

  const crearPeriodo = (nombre: string, fechaInicio: string, fechaFin: string, estado = "ABIERTO") =>
    prisma.periodo.create({ data: { nombre, fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin), estado: estado as "ABIERTO" | "CERRADO" } });

  const pa = await crearPeriodo(`PROV-${suf}-08`, "2026-08-01", "2026-08-31");
  const pb = await crearPeriodo(`PROV-${suf}-09`, "2026-09-01", "2026-09-30");
  const pc = await crearPeriodo(`PROV-${suf}-10`, "2026-10-01", "2026-10-31");
  const pcerrado = await crearPeriodo(`PROV-${suf}-11`, "2026-11-01", "2026-11-30", "CERRADO");
  periodoA = pa.id;
  periodoB = pb.id;
  periodoC = pc.id;
  periodoCerrado = pcerrado.id;

  await prisma.cuentaPorCobrar.create({
    data: { terceroId: clienteId, numeroDocumento: `PROV-${suf}-X`, fechaEmision: new Date("2026-05-01"), fechaVencimiento: new Date("2026-06-01"), valor: 1000000, saldo: 1000000, estado: "PENDIENTE" },
  });
  await prisma.cuentaPorCobrar.create({
    data: { terceroId: clienteId, numeroDocumento: `PROV-${suf}-Y`, fechaEmision: new Date("2026-06-01"), fechaVencimiento: new Date("2026-07-01"), valor: 500000, saldo: 500000, estado: "PENDIENTE" },
  });
});

afterAll(async () => {
  await prisma.provisionCartera.deleteMany({});
  await restaurarParametros();
  await prisma.cuentaPorCobrar.deleteMany({});
  await prisma.cuentaPorPagar.deleteMany({});
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Provisión" } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Reversión de provisión" } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `PROV-${suf}` } } });
  await prisma.tercero.deleteMany({ where: { documento: `PROV-${suf}` } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, contadorId, auxiliarId] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Provisión de cartera: validaciones", () => {
  it("no autenticado recibe 401", async () => {
    const res = await request(app).get("/api/cartera/provision/parametros");
    expect(res.status).toBe(401);
  });

  it("periodo inexistente recibe 404", async () => {
    const res = await calcular(999999, adminToken);
    expect(res.status).toBe(404);
  });

  it("periodo cerrado recibe 400", async () => {
    const res = await calcular(periodoCerrado, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cerrado");
  });

  it("AUXILIAR no puede actualizar parámetros (403)", async () => {
    const res = await request(app).put("/api/cartera/provision/parametros").set("Authorization", `Bearer ${auxiliarToken}`).send({ parametros: PARAMETROS_DEFECTO });
    expect(res.status).toBe(403);
  });
});

describe("Provisión de cartera: parámetros", () => {
  it("GET devuelve los parámetros por defecto", async () => {
    const res = await request(app).get("/api/cartera/provision/parametros").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
    expect(res.body[0].diasDesde).toBe(1);
    expect(res.body[3].diasHasta).toBe(null);
  });

  it("PUT reemplaza el conjunto de rangos", async () => {
    const res = await request(app).put("/api/cartera/provision/parametros").set("Authorization", `Bearer ${adminToken}`).send({
      parametros: [
        { diasDesde: 1, diasHasta: 60, porcentaje: 5 },
        { diasDesde: 61, diasHasta: null, porcentaje: 20 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[1].porcentaje).toBe(20);
  });

  it("rechaza rangos solapados (400)", async () => {
    const res = await request(app).put("/api/cartera/provision/parametros").set("Authorization", `Bearer ${adminToken}`).send({
      parametros: [
        { diasDesde: 1, diasHasta: 60, porcentaje: 5 },
        { diasDesde: 30, diasHasta: null, porcentaje: 20 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("solaparse");
  });

  it("rechaza rangos duplicados (400)", async () => {
    const res = await request(app).put("/api/cartera/provision/parametros").set("Authorization", `Bearer ${adminToken}`).send({
      parametros: [
        { diasDesde: 1, diasHasta: 30, porcentaje: 5 },
        { diasDesde: 1, diasHasta: 30, porcentaje: 5 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("duplicados");
  });

  it("restaura los parámetros por defecto", async () => {
    await restaurarParametros();
    const res = await request(app).get("/api/cartera/provision/parametros").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
  });
});

describe("Provisión de cartera: cálculo", () => {
  it("calcula la provisión del primer periodo y genera el asiento 5199/1399", async () => {
    const res = await calcular(periodoA, adminToken);
    expect(res.status).toBe(201);

    expect(res.body.resumen.requerido).toBe(250000);
    expect(res.body.resumen.balanceProvision).toBe(0);
    expect(res.body.resumen.incremental).toBe(250000);
    expect(res.body.provision.totalCalculado).toBe(250000);

    const comp = res.body.comprobante;
    expect(comp.totalDebito).toBe(250000);
    expect(comp.totalCredito).toBe(250000);
    expect(comp.numAsientos).toBe(2);

    const debito = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "5199");
    const credito = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "1399");
    expect(debito).toBeTruthy();
    expect(debito.debito).toBe(250000);
    expect(credito).toBeTruthy();
    expect(credito.credito).toBe(250000);

    expect(res.body.lineas.length).toBe(2);
  });

  it("no permite calcular dos veces el mismo periodo", async () => {
    const res = await calcular(periodoA, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ya fue calculada");
  });

  it("calcula el incremento sobre lo ya contabilizado en el segundo periodo", async () => {
    await prisma.cuentaPorCobrar.create({
      data: { terceroId: clienteId, numeroDocumento: `PROV-${suf}-Z`, fechaEmision: new Date("2026-06-01"), fechaVencimiento: new Date("2026-07-01"), valor: 300000, saldo: 300000, estado: "PENDIENTE" },
    });

    const res = await calcular(periodoB, contadorToken);
    expect(res.status).toBe(201);

    expect(res.body.resumen.requerido).toBe(360000);
    expect(res.body.resumen.balanceProvision).toBe(250000);
    expect(res.body.resumen.incremental).toBe(110000);
    expect(res.body.comprobante.totalDebito).toBe(110000);
  });

  it("si no hay ajuste, registra la provisión sin comprobante", async () => {
    const res = await calcular(periodoC, adminToken);
    expect(res.status).toBe(201);
    expect(res.body.resumen.requerido).toBe(360000);
    expect(res.body.resumen.incremental).toBe(0);
    expect(res.body.provision.totalCalculado).toBe(360000);
    expect(res.body.comprobante).toBe(null);
  });

  it("registra CALCULAR_PROVISION en la bitácora de auditoría", async () => {
    const provisionA = await prisma.provisionCartera.findUniqueOrThrow({ where: { periodoId: periodoA } });
    const res = await request(app).get("/api/auditoria?accion=CALCULAR_PROVISION&limite=500").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const reg = res.body.find((r: { entidadId: string }) => r.entidadId === String(provisionA.id));
    expect(reg).toBeTruthy();
    expect(reg.usuario).toBe("Prov Admin");
    expect(reg.detalle.incremental).toBe(250000);
  });

  it("anular el comprobante permite recalcular el periodo", async () => {
    const provisionA = await prisma.provisionCartera.findUniqueOrThrow({ where: { periodoId: periodoA } });
    expect(provisionA.comprobanteId).not.toBeNull();
    const anulacion = await request(app).post(`/api/comprobantes/${provisionA.comprobanteId}/anular`).set("Authorization", `Bearer ${adminToken}`);
    expect(anulacion.status).toBe(200);

    const res = await calcular(periodoA, adminToken);
    expect(res.status).toBe(201);
    expect(res.body.resumen.requerido).toBe(280000);
    expect(res.body.resumen.balanceProvision).toBe(110000);
    expect(res.body.resumen.incremental).toBe(170000);

    const filas = await prisma.provisionCartera.count({ where: { periodoId: periodoA } });
    expect(filas).toBe(1);
  });
});

describe("Provisión de cartera: consultas", () => {
  it("obtiene el detalle de la provisión de un periodo", async () => {
    const res = await request(app).get(`/api/cartera/provision/${periodoA}`).set("Authorization", `Bearer ${contadorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCalculado).toBe(280000);
    expect(res.body.comprobante).toBeTruthy();
    expect(res.body.comprobante.estado).toBe(EstadoComprobante.CONTABILIZADO);
    const asiento1399 = res.body.comprobante.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "1399");
    expect(asiento1399.credito).toBe(170000);
  });

  it("un periodo sin provisión responde 404", async () => {
    const sinProvision = await prisma.periodo.create({
      data: { nombre: `PROV-${suf}-sin`, fechaInicio: new Date("2026-12-01"), fechaFin: new Date("2026-12-31") },
    });
    const res = await request(app).get(`/api/cartera/provision/${sinProvision.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    await prisma.periodo.delete({ where: { id: sinProvision.id } });
  });

  it("CONTADOR puede consultar y calcular", async () => {
    const res = await request(app).get(`/api/cartera/provision/${periodoC}`).set("Authorization", `Bearer ${contadorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.comprobante).toBe(null);
  });
});
