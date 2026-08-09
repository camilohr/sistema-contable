import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";
import { EstadoNomina, EstadoComprobante } from "@prisma/client";

const app = createApp();

const emails = ["nom-admin@test.local", "nom-cont@test.local", "nom-aux@test.local"];
const suf = Date.now();

let adminId = "";
let contadorId = "";
let auxiliarId = "";
let adminToken = "";
let contadorToken = "";
let auxiliarToken = "";

let terceroA = "";
let terceroB = "";
let terceroC = "";
let terceroNit = "";
let empleadoA = "";
let empleadoB = "";
let empleadoC = "";
let periodoA = 0; // 2026-08 ABIERTO
let periodoB = 0; // 2026-09 ABIERTO
let periodoC = 0; // 2026-10 (sin liquidar)
let periodoCerrado = 0; // 2026-11 CERRADO

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

function liquidar(periodoId: number, token: string, body?: object) {
  return request(app).post(`/api/nomina/liquidar/${periodoId}`).set("Authorization", `Bearer ${token}`).send(body ?? {});
}

function contabilizar(periodoId: number, token: string) {
  return request(app).post(`/api/nomina/contabilizar/${periodoId}`).set("Authorization", `Bearer ${token}`);
}

function provisionar(periodoId: number, token: string) {
  return request(app).post(`/api/nomina/provisionar/${periodoId}`).set("Authorization", `Bearer ${token}`);
}

const PARAMETROS_DEFECTO = {
  smmlv: 1750905,
  auxilioTransporte: 249095,
  topeAuxilioTransporteSalarios: 2,
  topeIbcSalarios: 25,
  saludEmpleado: 4,
  pensionEmpleado: 4,
  saludEmpleador: 8.5,
  pensionEmpleador: 12,
  arlEmpleador: 0.522,
  cajaCompensacion: 4,
  icbf: 3,
  sena: 2,
  umbralParafiscales: 10,
  solidaridadUmbralSalarios: 4,
  interesesCesantias: 12,
};

const CUENTAS_DEFECTO: Record<string, string> = {
  SUELDO: "510505",
  HORAS_EXTRAS: "510510",
  COMISIONES: "510515",
  BONIFICACIONES: "510575",
  AUXILIO_TRANSPORTE: "510595",
  OTROS_DEVENGADOS: "510590",
  SALUD_GASTO: "510555",
  SALUD_PASIVO: "237005",
  PENSION_GASTO: "510565",
  PENSION_PASIVO: "237055",
  ARL_GASTO: "510560",
  ARL_PASIVO: "237010",
  CAJA_GASTO: "510540",
  CAJA_PASIVO: "237025",
  ICBF_GASTO: "510545",
  ICBF_PASIVO: "237015",
  SENA_GASTO: "510550",
  SENA_PASIVO: "237020",
  SOLIDARIDAD: "237030",
  RETEFUENTE: "236580",
  LIBRANZAS: "237035",
  EMBARGOS: "237040",
  OTROS_DESCUENTOS: "238055",
  NETO_POR_PAGAR: "238035",
  CESANTIAS_GASTO: "510535",
  CESANTIAS_PASIVO: "251005",
  INTERESES_CESANTIAS_GASTO: "510535",
  INTERESES_CESANTIAS_PASIVO: "251010",
  PRIMA_GASTO: "510535",
  PRIMA_PASIVO: "252005",
  VACACIONES_GASTO: "510535",
  VACACIONES_PASIVO: "252505",
};

async function restaurarParametros(): Promise<void> {
  const data = {
    smmlv: 1750905,
    auxilioTransporte: 249095,
    topeAuxilioTransporteSalarios: 2,
    topeIbcSalarios: 25,
    saludEmpleado: 4,
    pensionEmpleado: 4,
    saludEmpleador: 8.5,
    pensionEmpleador: 12,
    arlEmpleador: 0.522,
    cajaCompensacion: 4,
    icbf: 3,
    sena: 2,
    umbralParafiscales: 10,
    solidaridadUmbralSalarios: 4,
    interesesCesantias: 12,
  };
  await prisma.parametroNomina.deleteMany({ where: { empresaId: { not: null } } });
  const existente = await prisma.parametroNomina.findFirst({ where: { empresaId: null, anio: 2026 } });
  if (existente) {
    await prisma.parametroNomina.update({ where: { id: existente.id }, data });
  } else {
    await prisma.parametroNomina.create({ data: { anio: 2026, ...data } });
  }
  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: [...new Set(Object.values(CUENTAS_DEFECTO))] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  await prisma.parametroCuentaNomina.deleteMany({});
  await prisma.parametroCuentaNomina.createMany({
    data: Object.entries(CUENTAS_DEFECTO).map(([concepto, codigo]) => ({ concepto, cuentaId: porCodigo.get(codigo)! })),
  });
}

async function limpiar(): Promise<void> {
  await prisma.nomina.deleteMany({});
  await prisma.provisionNomina.deleteMany({});
  await prisma.empleado.deleteMany({});
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Nómina periodo" } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Provisión de prestaciones" } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `NOM-${suf}` } } });
  await prisma.tercero.deleteMany({ where: { documento: { startsWith: `NOM-${suf}` } } });
}

beforeAll(async () => {
  const idsPrevios = (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: idsPrevios } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await limpiar();

  const admin = await prisma.usuario.create({ data: { nombre: "Nom Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  adminId = admin.id;
  const contador = await prisma.usuario.create({ data: { nombre: "Nom Contador", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" } });
  contadorId = contador.id;
  const auxiliar = await prisma.usuario.create({ data: { nombre: "Nom Auxiliar", email: emails[2], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  auxiliarId = auxiliar.id;
  adminToken = await login(emails[0], "clave123");
  contadorToken = await login(emails[1], "clave123");
  auxiliarToken = await login(emails[2], "clave123");

  await restaurarParametros();

  const tA = await prisma.tercero.create({ data: { tipo: "AMBOS", tipoDocumento: "CC", documento: `NOM-${suf}-A`, nombreRazonSocial: "Empleado Uno" } });
  const tB = await prisma.tercero.create({ data: { tipo: "AMBOS", tipoDocumento: "CC", documento: `NOM-${suf}-B`, nombreRazonSocial: "Empleado Dos" } });
  const tC = await prisma.tercero.create({ data: { tipo: "AMBOS", tipoDocumento: "CC", documento: `NOM-${suf}-C`, nombreRazonSocial: "Empleado Tres" } });
  const tN = await prisma.tercero.create({ data: { tipo: "PROVEEDOR", tipoDocumento: "NIT", documento: `NOM-${suf}-NIT`, nombreRazonSocial: "Proveedor NIT" } });
  terceroA = tA.id;
  terceroB = tB.id;
  terceroC = tC.id;
  terceroNit = tN.id;

  const eA = await prisma.empleado.create({ data: { terceroId: tA.id, cargo: "Auxiliar", salarioBase: 1750905, fechaIngreso: new Date("2025-01-15"), arlEmpleador: 0.522 } });
  const eB = await prisma.empleado.create({ data: { terceroId: tB.id, cargo: "Gerente", salarioBase: 8000000, fechaIngreso: new Date("2024-03-01"), arlEmpleador: 0.522 } });
  const eC = await prisma.empleado.create({ data: { terceroId: tC.id, cargo: "Tesorero", salarioBase: 2000000, fechaIngreso: new Date("2024-06-01"), arlEmpleador: 0.522 } });
  empleadoA = eA.id;
  empleadoB = eB.id;
  empleadoC = eC.id;

  const crearPeriodo = (nombre: string, fechaInicio: string, fechaFin: string, estado = "ABIERTO") =>
    prisma.periodo.create({ data: { nombre, fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin), estado: estado as "ABIERTO" | "CERRADO" } });

  const pa = await crearPeriodo(`NOM-${suf}-08`, "2026-08-01", "2026-08-31");
  const pb = await crearPeriodo(`NOM-${suf}-09`, "2026-09-01", "2026-09-30");
  const pc = await crearPeriodo(`NOM-${suf}-10`, "2026-10-01", "2026-10-31");
  const pcerrado = await crearPeriodo(`NOM-${suf}-11`, "2026-11-01", "2026-11-30", "CERRADO");
  periodoA = pa.id;
  periodoB = pb.id;
  periodoC = pc.id;
  periodoCerrado = pcerrado.id;
});

afterAll(async () => {
  await limpiar();
  await restaurarParametros();
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, contadorId, auxiliarId] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Nómina: empleados", () => {
  it("lista los empleados activos", async () => {
    const res = await request(app).get("/api/empleados").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
    expect(res.body.every((e: { activo: boolean }) => e.activo)).toBe(true);
  });

  it("rechaza registrar un tercero que no sea CC", async () => {
    const res = await request(app).post("/api/empleados").set("Authorization", `Bearer ${adminToken}`).send({ terceroId: terceroNit, cargo: "Contratista", salarioBase: 2000000, fechaIngreso: "2026-01-01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("CC");
  });

  it("rechaza registrar dos veces el mismo tercero", async () => {
    const res = await request(app).post("/api/empleados").set("Authorization", `Bearer ${adminToken}`).send({ terceroId: terceroA, cargo: "Auxiliar", salarioBase: 1750905, fechaIngreso: "2025-01-15" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ya está registrado");
  });

  it("AUXILIAR no puede crear empleados (403)", async () => {
    const res = await request(app).post("/api/empleados").set("Authorization", `Bearer ${auxiliarToken}`).send({ terceroId: terceroA, salarioBase: 1750905, fechaIngreso: "2025-01-15" });
    expect(res.status).toBe(403);
  });

  it("actualiza el salario base de un empleado", async () => {
    const res = await request(app).patch(`/api/empleados/${empleadoA}`).set("Authorization", `Bearer ${contadorToken}`).send({ salarioBase: 1750905, cargo: "Auxiliar contable" });
    expect(res.status).toBe(200);
    expect(res.body.salarioBase).toBe(1750905);
    expect(res.body.cargo).toBe("Auxiliar contable");
  });

  it("retira un empleado y lo excluye de los activos", async () => {
    const res = await request(app).post(`/api/empleados/${empleadoC}/retiro`).set("Authorization", `Bearer ${adminToken}`).send({ fechaRetiro: "2026-07-31" });
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
    const activos = await request(app).get("/api/empleados?activo=true").set("Authorization", `Bearer ${adminToken}`);
    expect(activos.body.length).toBe(2);
  });
});

describe("Nómina: parámetros", () => {
  it("GET devuelve los parámetros de nómina por año", async () => {
    const res = await request(app).get("/api/nomina/parametros").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const p2026 = res.body.find((p: { anio: number }) => p.anio === 2026);
    expect(p2026.smmlv).toBe(1750905);
    expect(p2026.auxilioTransporte).toBe(249095);
    expect(p2026.umbralParafiscales).toBe(10);
  });

  it("rechaza un año inválido en PUT (400)", async () => {
    const res = await request(app).put("/api/nomina/parametros/abc").set("Authorization", `Bearer ${adminToken}`).send(PARAMETROS_DEFECTO);
    expect(res.status).toBe(400);
  });

  it("rechaza datos inválidos (400)", async () => {
    const res = await request(app).put("/api/nomina/parametros/2026").set("Authorization", `Bearer ${adminToken}`).send({ ...PARAMETROS_DEFECTO, smmlv: -1 });
    expect(res.status).toBe(400);
  });

  it("AUXILIAR no puede actualizar parámetros (403)", async () => {
    const res = await request(app).put("/api/nomina/parametros/2026").set("Authorization", `Bearer ${auxiliarToken}`).send(PARAMETROS_DEFECTO);
    expect(res.status).toBe(403);
  });

  it("PUT actualiza y crea los parámetros del año", async () => {
    const res = await request(app).put("/api/nomina/parametros/2027").set("Authorization", `Bearer ${adminToken}`).send({ ...PARAMETROS_DEFECTO, smmlv: 1850000 });
    expect(res.status).toBe(200);
    expect(res.body.anio).toBe(2027);
    expect(res.body.smmlv).toBe(1850000);
  });

  it("GET parametros-cuentas devuelve el mapeo completo", async () => {
    const res = await request(app).get("/api/nomina/parametros-cuentas").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(32);
    const neto = res.body.find((c: { concepto: string }) => c.concepto === "NETO_POR_PAGAR");
    expect(neto.codigoCuenta).toBe("238035");
  });

  it("rechaza conceptos desconocidos en el mapeo (400)", async () => {
    const res = await request(app).put("/api/nomina/parametros-cuentas").set("Authorization", `Bearer ${adminToken}`).send({ cuentas: [{ concepto: "SUELDO", cuentaId: 1 }, { concepto: "INVENTO", cuentaId: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Conceptos desconocidos");
  });

  it("rechaza cuentas inexistentes en el mapeo (400)", async () => {
    const res = await request(app).put("/api/nomina/parametros-cuentas").set("Authorization", `Bearer ${adminToken}`).send({ cuentas: [{ concepto: "SUELDO", cuentaId: 999999 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("no existe");
  });

  it("restaura el mapeo por defecto", async () => {
    await restaurarParametros();
    const res = await request(app).get("/api/nomina/parametros-cuentas").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(32);
  });
});

describe("Nómina: liquidación", () => {
  it("no autenticado recibe 401", async () => {
    const res = await request(app).post(`/api/nomina/liquidar/${periodoA}`);
    expect(res.status).toBe(401);
  });

  it("periodo inexistente recibe 404", async () => {
    const res = await liquidar(999999, adminToken);
    expect(res.status).toBe(404);
  });

  it("periodo cerrado recibe 400", async () => {
    const res = await liquidar(periodoCerrado, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cerrado");
  });

  it("AUXILIAR no puede liquidar (403)", async () => {
    const res = await liquidar(periodoA, auxiliarToken);
    expect(res.status).toBe(403);
  });

  it("rechaza ajustes de empleados inactivos (400)", async () => {
    const res = await liquidar(periodoA, adminToken, { ajustes: [{ empleadoId: empleadoC, diasTrabajados: 30 }] });
    expect(res.status).toBe(400);
  });

  it("liquida los empleados activos con los valores esperados", async () => {
    const res = await liquidar(periodoA, adminToken);
    expect(res.status).toBe(201);
    expect(res.body.empleados).toBe(2);

    const uno = res.body.lineas.find((l: { documento: string }) => l.documento === `NOM-${suf}-A`);
    expect(uno.sueldo).toBe(1750905);
    expect(uno.auxilioTransporte).toBe(249095);
    expect(uno.totalDevengado).toBe(2000000);
    expect(uno.saludEmpleado).toBe(70036.2);
    expect(uno.pensionEmpleado).toBe(70036.2);
    expect(uno.totalDeducciones).toBe(140072.4);
    expect(uno.netoPagar).toBe(1859927.6);
    expect(uno.solidaridad).toBe(0);
    expect(uno.aporteIcbf).toBe(0);
    expect(uno.aporteSena).toBe(0);
    expect(uno.aporteArl).toBe(9139.72);

    const dos = res.body.lineas.find((l: { documento: string }) => l.documento === `NOM-${suf}-B`);
    expect(dos.sueldo).toBe(8000000);
    expect(dos.auxilioTransporte).toBe(0);
    expect(dos.solidaridad).toBe(80000);
    expect(dos.totalDevengado).toBe(8000000);
    expect(dos.totalDeducciones).toBe(720000);
    expect(dos.netoPagar).toBe(7280000);

    expect(res.body.totales.totalDevengado).toBe(10000000);
    expect(res.body.totales.totalDeducciones).toBe(860072.4);
    expect(res.body.totales.netoPagar).toBe(9139927.6);
    expect(res.body.totales.aportes.salud).toBe(828826.93);
    expect(res.body.totales.aportes.pension).toBe(1170108.6);
  });

  it("admite reliquidar el periodo sin contabilizar", async () => {
    const res = await liquidar(periodoA, adminToken);
    expect(res.status).toBe(201);
    expect(res.body.empleados).toBe(2);
  });

  it("obtiene la liquidación de un periodo", async () => {
    const res = await request(app).get(`/api/nomina/${periodoA}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.lineas.length).toBe(2);
    expect(res.body.periodo).toContain(`NOM-${suf}-08`);
  });

  it("un periodo sin liquidar responde 404", async () => {
    const res = await request(app).get(`/api/nomina/${periodoC}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Nómina: contabilización", () => {
  it("rechaza contabilizar sin nómina liquidada (400)", async () => {
    const res = await contabilizar(periodoC, adminToken);
    expect(res.status).toBe(400);
  });

  it("contabiliza el periodo generando el comprobante balanceado", async () => {
    const res = await contabilizar(periodoA, adminToken);
    expect(res.status).toBe(201);
    const comp = res.body.comprobante;
    expect(comp.totalDebito).toBe(12439871.45);
    expect(comp.totalCredito).toBe(12439871.45);
    expect(comp.numAsientos).toBe(12);

    const sueldos = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "510505");
    expect(sueldos.debito).toBe(9750905);
    const auxilio = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "510595");
    expect(auxilio.debito).toBe(249095);
    const neto = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "238035");
    expect(neto.credito).toBe(9139927.6);
    const solidaridad = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "237030");
    expect(solidaridad.credito).toBe(80000);
    expect(comp.asientos.some((a: { codigoCuenta: string }) => a.codigoCuenta === "510545")).toBe(false);
    expect(comp.asientos.some((a: { codigoCuenta: string }) => a.codigoCuenta === "510550")).toBe(false);
  });

  it("marca la nómina como CONTABILIZADO", async () => {
    const filas = await prisma.nomina.findMany({ where: { periodoId: periodoA } });
    expect(filas.every((n) => n.estado === EstadoNomina.CONTABILIZADO)).toBe(true);
    expect(filas[0].comprobanteId).not.toBeNull();
  });

  it("no permite reliquidar un periodo contabilizado (400)", async () => {
    const res = await liquidar(periodoA, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("contabilizada");
  });

  it("no permite contabilizar dos veces (400)", async () => {
    const res = await contabilizar(periodoA, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("contabilizada");
  });
});

describe("Nómina: provisión de prestaciones", () => {
  it("rechaza provisionar sin nómina contabilizada (400)", async () => {
    const res = await provisionar(periodoB, adminToken);
    expect(res.status).toBe(400);
  });

  it("provisiona el periodo y genera el comprobante de prestaciones", async () => {
    await liquidar(periodoB, adminToken);
    const cont = await contabilizar(periodoB, adminToken);
    expect(cont.status).toBe(201);

    const res = await provisionar(periodoB, adminToken);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(2080942.74);
    const comp = res.body.comprobante;
    expect(comp.totalDebito).toBe(2080942.74);
    expect(comp.totalCredito).toBe(2080942.74);
    expect(comp.numAsientos).toBe(8);
    const cesantias = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "510535");
    expect(cesantias.debito).toBe(833000);
    const cesantiasPasivo = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "251005");
    expect(cesantiasPasivo.credito).toBe(833000);
    const vacacionesPasivo = comp.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "252505");
    expect(vacacionesPasivo.credito).toBe(406612.74);
  });

  it("no permite provisionar dos veces el mismo periodo (400)", async () => {
    const res = await provisionar(periodoB, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ya fue calculada");
  });

  it("obtiene la provisión de un periodo", async () => {
    const res = await request(app).get(`/api/nomina/provision/${periodoB}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.lineas.length).toBe(2);
    expect(res.body.comprobante.estado).toBe(EstadoComprobante.CONTABILIZADO);
  });

  it("anular el comprobante de provisión permite recalcular", async () => {
    const provision = await prisma.provisionNomina.findFirstOrThrow({ where: { periodoId: periodoB } });
    const anulacion = await request(app).post(`/api/comprobantes/${provision.comprobanteId}/anular`).set("Authorization", `Bearer ${adminToken}`);
    expect(anulacion.status).toBe(200);

    const res = await provisionar(periodoB, adminToken);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(2080942.74);
  });
});

describe("Nómina: anulación de comprobante y reliquidación", () => {
  it("anular el comprobante de nómina marca las liquidaciones ANULADO", async () => {
    const nomina = await prisma.nomina.findFirstOrThrow({ where: { periodoId: periodoA } });
    const anulacion = await request(app).post(`/api/comprobantes/${nomina.comprobanteId}/anular`).set("Authorization", `Bearer ${adminToken}`);
    expect(anulacion.status).toBe(200);

    const filas = await prisma.nomina.findMany({ where: { periodoId: periodoA } });
    expect(filas.every((n) => n.estado === EstadoNomina.ANULADO)).toBe(true);
  });

  it("reliquida y vuelve a contabilizar después de anular", async () => {
    const res = await liquidar(periodoA, adminToken);
    expect(res.status).toBe(201);
    expect(res.body.empleados).toBe(2);

    const cont = await contabilizar(periodoA, adminToken);
    expect(cont.status).toBe(201);
    expect(cont.body.comprobante.totalDebito).toBe(12439871.45);
  });

  it("registra las acciones en la bitácora de auditoría", async () => {
    const res = await request(app).get("/api/auditoria?accion=LIQUIDAR_NOMINA&limite=500").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const reg = res.body.find((r: { usuario: string }) => r.usuario === "Nom Admin");
    expect(reg).toBeTruthy();
    expect(reg.detalle.periodo).toContain(`NOM-${suf}-08`);
    expect(reg.detalle.empleados).toBe(2);
  });
});
