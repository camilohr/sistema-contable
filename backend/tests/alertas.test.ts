import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { REGLAS_DEFECTO } from "../src/lib/alertas.js";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

const app = createApp();

const emails = ["alertas-admin@test.local", "alertas-cont@test.local", "alertas-aux@test.local"];
const suf = Date.now();
const prefijo = `ALERTAS-${suf}`;

let adminToken = "";
let contadorToken = "";
let auxiliarToken = "";

function hoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumarDias(dias: number): Date {
  const d = hoy();
  d.setDate(d.getDate() + dias);
  return d;
}

interface TestIds {
  cxcVencida: number;
  cxcProxima: number;
  cxcLejana: number;
  cxpProxima: number;
  cxpCancelada: number;
  activoDepreciado: number;
  periodoAbiertoVencido: number;
  terceroSinMovimiento: string;
  terceroConRecibo: string;
}

const ids: Partial<TestIds> = {};

beforeAll(async () => {
  await prisma.reglaAlerta.deleteMany({});

  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: prefijo } } });
  await prisma.cuentaPorCobrar.deleteMany({ where: { numeroDocumento: { startsWith: prefijo } } });
  await prisma.cuentaPorPagar.deleteMany({ where: { numeroDocumento: { startsWith: prefijo } } });
  await prisma.recibo.deleteMany({ where: { numero: { startsWith: prefijo } } });
  await prisma.activoFijo.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  await prisma.tercero.deleteMany({ where: { documento: { startsWith: prefijo } } });
  const usuariosPrevios = await prisma.usuario.findMany({ where: { email: { in: emails } } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuariosPrevios.map((u) => u.id) } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  await prisma.usuario.create({ data: { nombre: "Alertas Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "Alertas Contador", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" } });
  await prisma.usuario.create({ data: { nombre: "Alertas Auxiliar", email: emails[2], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });

  adminToken = (await request(app).post("/api/auth/login").send({ email: emails[0], password: "clave123" })).body.token;
  contadorToken = (await request(app).post("/api/auth/login").send({ email: emails[1], password: "clave123" })).body.token;
  auxiliarToken = (await request(app).post("/api/auth/login").send({ email: emails[2], password: "clave123" })).body.token;

  const clienteVencido = await prisma.tercero.create({
    data: { tipo: "CLIENTE", tipoDocumento: "CC", documento: `${prefijo}-VENC`, nombreRazonSocial: `Cliente Vencido ${prefijo}` },
  });
  const clienteReciente = await prisma.tercero.create({
    data: { tipo: "CLIENTE", tipoDocumento: "CC", documento: `${prefijo}-REC`, nombreRazonSocial: `Cliente Reciente ${prefijo}` },
  });
  const proveedor = await prisma.tercero.create({
    data: { tipo: "PROVEEDOR", tipoDocumento: "NIT", documento: `${prefijo}-PROV`, nombreRazonSocial: `Proveedor ${prefijo}` },
  });

  const cxcVencida = await prisma.cuentaPorCobrar.create({
    data: { terceroId: clienteVencido.id, numeroDocumento: `${prefijo}-VENC`, fechaEmision: sumarDias(-20), fechaVencimiento: sumarDias(-5), valor: 300000, saldo: 300000, estado: "PENDIENTE" },
  });
  const cxcProxima = await prisma.cuentaPorCobrar.create({
    data: { terceroId: clienteVencido.id, numeroDocumento: `${prefijo}-PROX`, fechaEmision: sumarDias(-10), fechaVencimiento: sumarDias(5), valor: 500000, saldo: 500000, estado: "PENDIENTE" },
  });
  const cxcLejana = await prisma.cuentaPorCobrar.create({
    data: { terceroId: clienteVencido.id, numeroDocumento: `${prefijo}-LEJ`, fechaEmision: sumarDias(0), fechaVencimiento: sumarDias(60), valor: 100000, saldo: 100000, estado: "PENDIENTE" },
  });
  const cxpProxima = await prisma.cuentaPorPagar.create({
    data: { terceroId: proveedor.id, numeroDocumento: `${prefijo}-CPX`, fechaEmision: sumarDias(-10), fechaVencimiento: sumarDias(3), valor: 200000, saldo: 200000, estado: "PENDIENTE" },
  });
  const cxpCancelada = await prisma.cuentaPorPagar.create({
    data: { terceroId: proveedor.id, numeroDocumento: `${prefijo}-CPC`, fechaEmision: sumarDias(-30), fechaVencimiento: sumarDias(-15), valor: 400000, saldo: 0, estado: "CANCELADA" },
  });

  await prisma.recibo.create({
    data: { numero: `${prefijo}-R1`, fecha: hoy(), terceroId: clienteReciente.id, valor: 10000 },
  });

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["152005", "159625", "516020"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  const cuentaActivoId = porCodigo.get("152005")!;
  const cuentaAcumId = porCodigo.get("159625")!;
  const cuentaGastoId = porCodigo.get("516020")!;
  if (!cuentaActivoId || !cuentaAcumId || !cuentaGastoId) {
    throw new Error("Faltan cuentas PUC 152005/159625/516020 (ejecutar npm run db:seed)");
  }

  const activo = await prisma.activoFijo.create({
    data: {
      cuentaId: cuentaActivoId,
      cuentaDepreciacionId: cuentaAcumId,
      cuentaGastoId,
      nombre: `${prefijo}-PC`,
      fechaAdquisicion: new Date("2025-01-10"),
      valor: new Prisma.Decimal(1000000),
      vidaUtilMeses: 12,
      valorResidual: new Prisma.Decimal(0),
      depreciacionAcumulada: new Prisma.Decimal(1000000),
      estado: "DEPRECIADO_TOTAL",
    },
  });

  const periodoVencido = await prisma.periodo.create({
    data: { nombre: `${prefijo}-P-ABIERTO`, fechaInicio: sumarDias(-40), fechaFin: sumarDias(-10), estado: "ABIERTO" },
  });
  await prisma.periodo.create({
    data: { nombre: `${prefijo}-P-FUTURO`, fechaInicio: sumarDias(10), fechaFin: sumarDias(40), estado: "ABIERTO" },
  });

  ids.cxcVencida = cxcVencida.id;
  ids.cxcProxima = cxcProxima.id;
  ids.cxcLejana = cxcLejana.id;
  ids.cxpProxima = cxpProxima.id;
  ids.cxpCancelada = cxpCancelada.id;
  ids.activoDepreciado = activo.id;
  ids.periodoAbiertoVencido = periodoVencido.id;
  ids.terceroSinMovimiento = clienteVencido.id;
  ids.terceroConRecibo = clienteReciente.id;
});

afterAll(async () => {
  await prisma.reglaAlerta.deleteMany({});
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: prefijo } } });
  await prisma.cuentaPorCobrar.deleteMany({ where: { numeroDocumento: { startsWith: prefijo } } });
  await prisma.cuentaPorPagar.deleteMany({ where: { numeroDocumento: { startsWith: prefijo } } });
  await prisma.recibo.deleteMany({ where: { numero: { startsWith: prefijo } } });
  await prisma.activoFijo.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  await prisma.tercero.deleteMany({ where: { documento: { startsWith: prefijo } } });
  const usuarios = await prisma.usuario.findMany({ where: { email: { in: emails } } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

function getAlertas(token: string) {
  return request(app).get("/api/alertas").set("Authorization", `Bearer ${token}`);
}

describe("Alertas: autenticación y roles", () => {
  it("sin autenticación recibe 401 (GET y PUT)", async () => {
    const get = await request(app).get("/api/alertas");
    const reglas = await request(app).get("/api/alertas/reglas");
    const put = await request(app).put("/api/alertas/reglas").send({ reglas: [] });
    expect(get.status).toBe(401);
    expect(reglas.status).toBe(401);
    expect(put.status).toBe(401);
  });

  it("todos los roles pueden consultar alertas y reglas", async () => {
    for (const token of [adminToken, contadorToken, auxiliarToken]) {
      const res = await getAlertas(token);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.alertas)).toBe(true);
      const reglas = await request(app).get("/api/alertas/reglas").set("Authorization", `Bearer ${token}`);
      expect(reglas.status).toBe(200);
      expect(reglas.body).toHaveLength(REGLAS_DEFECTO.length);
    }
  });

  it("AUXILIAR recibe 403 en PUT /reglas; ADMIN y CONTADOR pueden actualizar", async () => {
    const aux = await request(app)
      .put("/api/alertas/reglas")
      .set("Authorization", `Bearer ${auxiliarToken}`)
      .send({ reglas: [{ tipo: "CARTERA_VENCE", dias: 15, activa: true }] });
    expect(aux.status).toBe(403);

    for (const token of [adminToken, contadorToken]) {
      const res = await request(app)
        .put("/api/alertas/reglas")
        .set("Authorization", `Bearer ${token}`)
        .send({ reglas: [{ tipo: "CARTERA_VENCE", dias: 15, activa: true }] });
      expect(res.status).toBe(200);
    }
  });

  it("rechaza tipo de regla inválido", async () => {
    const res = await request(app)
      .put("/api/alertas/reglas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reglas: [{ tipo: "INEXISTENTE", dias: 5, activa: true }] });
    expect(res.status).toBe(400);
  });
});

describe("Alertas: generación según reglas", () => {
  it("genera cartera vencida (ALTA), próxima a vencer (MEDIA) y excluye las que no aplican", async () => {
    const res = await getAlertas(adminToken);
    expect(res.status).toBe(200);

    const porEntidad = new Map(res.body.alertas.map((a: { entidad: string; entidadId: string }) => [`${a.entidad}:${a.entidadId}`, a]));

    const vencida = porEntidad.get(`CuentaPorCobrar:${ids.cxcVencida}`);
    expect(vencida).toBeTruthy();
    expect(vencida.severidad).toBe("ALTA");
    expect(vencida.mensaje).toContain("venció");
    expect(vencida.monto).toBe(300000);

    const proxima = porEntidad.get(`CuentaPorCobrar:${ids.cxcProxima}`);
    expect(proxima).toBeTruthy();
    expect(proxima.severidad).toBe("MEDIA");
    expect(proxima.mensaje).toContain("vence");

    const cxp = porEntidad.get(`CuentaPorPagar:${ids.cxpProxima}`);
    expect(cxp).toBeTruthy();
    expect(cxp.severidad).toBe("MEDIA");

    expect(porEntidad.has(`CuentaPorCobrar:${ids.cxcLejana}`)).toBe(false);
    expect(porEntidad.has(`CuentaPorPagar:${ids.cxpCancelada}`)).toBe(false);
  });

  it("alerta periodo terminado y aún abierto", async () => {
    const res = await getAlertas(contadorToken);
    const porEntidad = new Map(res.body.alertas.map((a: { entidad: string; entidadId: string }) => [`${a.entidad}:${a.entidadId}`, a]));
    const alerta = porEntidad.get(`Periodo:${ids.periodoAbiertoVencido}`);
    expect(alerta).toBeTruthy();
    expect(alerta.tipo).toBe("PERIODO_SIN_CERRAR");
    expect(alerta.mensaje).toContain("sigue abierto");
  });

  it("alerta activos totalmente depreciados sin dar de baja", async () => {
    const res = await getAlertas(auxiliarToken);
    const porEntidad = new Map(res.body.alertas.map((a: { entidad: string; entidadId: string }) => [`${a.entidad}:${a.entidadId}`, a]));
    const alerta = porEntidad.get(`ActivoFijo:${ids.activoDepreciado}`);
    expect(alerta).toBeTruthy();
    expect(alerta.tipo).toBe("ACTIVO_SIN_BAJA");
    expect(alerta.mensaje).toContain("totalmente depreciado");
  });

  it("alerta clientes sin movimientos recientes y excluye a los que sí tienen", async () => {
    const res = await getAlertas(adminToken);
    const sinMovimiento = res.body.alertas.filter((a: { tipo: string }) => a.tipo === "TERCERO_SIN_MOVIMIENTO");

    const porEntidad = new Map(sinMovimiento.map((a: { entidadId: string }) => [a.entidadId, a]));
    expect(porEntidad.has(ids.terceroSinMovimiento)).toBe(true);
    expect(porEntidad.has(ids.terceroConRecibo)).toBe(false);
  });
});

describe("Alertas: configuración de reglas", () => {
  it("desactivar una regla suprime sus alertas", async () => {
    await request(app)
      .put("/api/alertas/reglas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reglas: [
          { tipo: "CARTERA_VENCE", dias: 15, activa: false },
          { tipo: "PERIODO_SIN_CERRAR", dias: null, activa: true },
          { tipo: "ACTIVO_SIN_BAJA", dias: null, activa: true },
          { tipo: "TERCERO_SIN_MOVIMIENTO", dias: 90, activa: true },
        ],
      });

    const res = await getAlertas(adminToken);
    expect(res.body.alertas.some((a: { tipo: string }) => a.tipo === "CARTERA_VENCE")).toBe(false);
    expect(res.body.alertas.some((a: { tipo: string }) => a.tipo === "PERIODO_SIN_CERRAR")).toBe(true);
  });

  it("GET /reglas refleja los cambios", async () => {
    const res = await request(app).get("/api/alertas/reglas").set("Authorization", `Bearer ${auxiliarToken}`);
    const regla = res.body.find((r: { tipo: string }) => r.tipo === "CARTERA_VENCE");
    expect(regla.activa).toBe(false);
  });

  it("restaurar reglas devuelve las alertas de cartera", async () => {
    await request(app)
      .put("/api/alertas/reglas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reglas: [
          { tipo: "CARTERA_VENCE", dias: 15, activa: true },
          { tipo: "PERIODO_SIN_CERRAR", dias: null, activa: true },
          { tipo: "ACTIVO_SIN_BAJA", dias: null, activa: true },
          { tipo: "TERCERO_SIN_MOVIMIENTO", dias: 90, activa: true },
        ],
      });

    const res = await getAlertas(adminToken);
    const cartera = res.body.alertas.find((a: { tipo: string }) => a.tipo === "CARTERA_VENCE");
    expect(cartera).toBeTruthy();
  });
});
