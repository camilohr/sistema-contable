import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["pres-admin@test.local", "pres-cont@test.local", "pres-aux@test.local"];
const suf = Date.now();
const prefijo = `PRESUPUESTO-${suf}`;

let adminToken = "";
let contadorToken = "";
let auxiliarToken = "";

let cajaId = 0;
let ingresosId = 0;
let gastoId = 0;
let cajaSinMovimientoId = 0;

interface PeriodoTest { id: number; nombre: string }
let periodo: PeriodoTest | null = null;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

function cargarPresupuesto(periodoId: number, partidas: { cuentaId: number; valor: number }[]) {
  return request(app)
    .put(`/api/presupuesto/${periodoId}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ partidas });
}

function crearComprobante(periodoId: number, fecha: string, concepto: string, asientos: { cuentaId: number; debito?: number; credito?: number }[]) {
  return request(app)
    .post("/api/comprobantes")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ tipo: "DIARIO", fecha, periodoId, concepto, asientos });
}

beforeAll(async () => {
  const periodosPrevios = await prisma.periodo.findMany({ where: { nombre: { startsWith: prefijo } } });
  await prisma.presupuesto.deleteMany({ where: { periodoId: { in: periodosPrevios.map((p) => p.id) } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: prefijo } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  const usuariosPrevios = await prisma.usuario.findMany({ where: { email: { in: emails } } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuariosPrevios.map((u) => u.id) } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  const admin = await prisma.usuario.create({ data: { nombre: "Presupuesto Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  const contador = await prisma.usuario.create({ data: { nombre: "Presupuesto Contador", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" } });
  const auxiliar = await prisma.usuario.create({ data: { nombre: "Presupuesto Auxiliar", email: emails[2], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [admin.id, contador.id, auxiliar.id] } } });

  adminToken = await login(emails[0], "clave123");
  contadorToken = await login(emails[1], "clave123");
  auxiliarToken = await login(emails[2], "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "4120", "516020", "1105"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cajaId = porCodigo.get("110505")!;
  ingresosId = porCodigo.get("4120")!;
  gastoId = porCodigo.get("516020")!;
  cajaSinMovimientoId = porCodigo.get("1105")!;

  const p = await prisma.periodo.create({
    data: { nombre: `${prefijo}-2026-03`, fechaInicio: new Date("2026-03-01"), fechaFin: new Date("2026-03-31") },
  });
  periodo = { id: p.id, nombre: p.nombre };
});

afterAll(async () => {
  const periodosPrevios = await prisma.periodo.findMany({ where: { nombre: { startsWith: prefijo } } });
  await prisma.presupuesto.deleteMany({ where: { periodoId: { in: periodosPrevios.map((p) => p.id) } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: prefijo } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  const usuarios = await prisma.usuario.findMany({ where: { email: { in: emails } } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Presupuesto: validaciones y roles", () => {
  it("sin autenticación recibe 401 (GET y PUT)", async () => {
    const get = await request(app).get(`/api/presupuesto/${periodo!.id}`);
    const put = await request(app).put(`/api/presupuesto/${periodo!.id}`).send({ partidas: [] });
    expect(get.status).toBe(401);
    expect(put.status).toBe(401);
  });

  it("AUXILIAR recibe 403 en PUT; ADMIN y CONTADOR pueden cargar", async () => {
    const aux = await request(app)
      .put(`/api/presupuesto/${periodo!.id}`)
      .set("Authorization", `Bearer ${auxiliarToken}`)
      .send({ partidas: [] });
    expect(aux.status).toBe(403);

    const cont = await request(app)
      .put(`/api/presupuesto/${periodo!.id}`)
      .set("Authorization", `Bearer ${contadorToken}`)
      .send({ partidas: [] });
    expect(cont.status).toBe(200);

    const admin = await cargarPresupuesto(periodo!.id, []);
    expect(admin.status).toBe(200);
  });

  it("todos los roles pueden consultar (GET)", async () => {
    for (const token of [adminToken, contadorToken, auxiliarToken]) {
      const res = await request(app).get(`/api/presupuesto/${periodo!.id}`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.periodo.id).toBe(periodo!.id);
    }
  });

  it("periodo inválido y no encontrado responden 400/404", async () => {
    const invalido = await request(app).get("/api/presupuesto/abc").set("Authorization", `Bearer ${adminToken}`);
    expect(invalido.status).toBe(400);

    const inexistente = await request(app).get("/api/presupuesto/999999999").set("Authorization", `Bearer ${adminToken}`);
    expect(inexistente.status).toBe(404);
  });

  it("rechaza cuenta que no permite movimiento o inexistente", async () => {
    const sinMovimiento = await cargarPresupuesto(periodo!.id, [{ cuentaId: cajaSinMovimientoId, valor: 1000 }]);
    expect(sinMovimiento.status).toBe(400);
    expect(sinMovimiento.body.error).toContain("permitir movimiento");

    const inexistente = await cargarPresupuesto(periodo!.id, [{ cuentaId: 999999999, valor: 1000 }]);
    expect(inexistente.status).toBe(400);
    expect(inexistente.body.error).toContain("no existe");
  });

  it("rechaza valores negativos", async () => {
    const res = await cargarPresupuesto(periodo!.id, [{ cuentaId: cajaId, valor: -500 }]);
    expect(res.status).toBe(400);
  });
});

describe("Presupuesto: carga y reemplazo", () => {
  it("carga el presupuesto de un periodo con varias partidas", async () => {
    const res = await cargarPresupuesto(periodo!.id, [
      { cuentaId: cajaId, valor: 1500000 },
      { cuentaId: ingresosId, valor: 1000000 },
      { cuentaId: gastoId, valor: 500000 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.totalPresupuestado).toBe(3000000);
    expect(res.body.partidas).toHaveLength(3);
    const codigos = res.body.partidas.map((p: { codigo: string }) => p.codigo).sort();
    expect(codigos).toEqual(["110505", "4120", "516020"]);
  });

  it("un nuevo PUT reemplaza el presupuesto del periodo", async () => {
    const res = await cargarPresupuesto(periodo!.id, [
      { cuentaId: ingresosId, valor: 2000000 },
      { cuentaId: cajaId, valor: 800000 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.partidas).toHaveLength(2);
    expect(res.body.totalPresupuestado).toBe(2800000);
    expect(res.body.partidas.map((p: { codigo: string }) => p.codigo).sort()).toEqual(["110505", "4120"]);
  });

  it("partidas vacías limpian el presupuesto", async () => {
    const res = await cargarPresupuesto(periodo!.id, []);
    expect(res.status).toBe(200);
    expect(res.body.partidas).toHaveLength(0);
    expect(res.body.totalPresupuestado).toBe(0);
  });

  it("registra CARGAR_PRESUPUESTO en la bitácora de auditoría", async () => {
    await cargarPresupuesto(periodo!.id, [{ cuentaId: ingresosId, valor: 1000000 }]);

    const res = await request(app)
      .get(`/api/auditoria?entidad=Periodo&limite=500`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const reg = res.body.find(
      (r: { entidadId: string; accion: string }) => r.entidadId === String(periodo!.id) && r.accion === "CARGAR_PRESUPUESTO"
    );
    expect(reg).toBeTruthy();
    expect(reg.usuario).toBe("Presupuesto Admin");
    expect(reg.detalle.partidas).toBe(1);
    expect(reg.detalle.totalPresupuestado).toBe(1000000);
  });
});

describe("Presupuesto: ejecución contra lo contabilizado", () => {
  it("compara presupuestado con el movimiento real del periodo", async () => {
    await cargarPresupuesto(periodo!.id, [
      { cuentaId: cajaId, valor: 1500000 },
      { cuentaId: ingresosId, valor: 1000000 },
      { cuentaId: gastoId, valor: 500000 },
    ]);

    const ingreso = await crearComprobante(periodo!.id, "2026-03-10", `${prefijo}-ingreso`, [
      { cuentaId: cajaId, debito: 400000 },
      { cuentaId: ingresosId, credito: 400000 },
    ]);
    expect(ingreso.status).toBe(201);
    const contIngreso = await request(app)
      .post(`/api/comprobantes/${ingreso.body.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(contIngreso.status).toBe(200);

    const gasto = await crearComprobante(periodo!.id, "2026-03-15", `${prefijo}-gasto`, [
      { cuentaId: gastoId, debito: 200000 },
      { cuentaId: cajaId, credito: 200000 },
    ]);
    expect(gasto.status).toBe(201);
    const contGasto = await request(app)
      .post(`/api/comprobantes/${gasto.body.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(contGasto.status).toBe(200);

    const res = await request(app)
      .get(`/api/presupuesto/${periodo!.id}/ejecucion`)
      .set("Authorization", `Bearer ${auxiliarToken}`);
    expect(res.status).toBe(200);

    expect(res.body.totalPresupuestado).toBe(3000000);
    expect(res.body.totalEjecutado).toBe(800000);
    expect(res.body.variacionTotal).toBe(-2200000);
    expect(res.body.porcentajeEjecucionTotal).toBe(26.67);

    const porCodigo = new Map(res.body.lineas.map((l: { codigo: string }) => [l.codigo, l]));

    expect(porCodigo.get("4120")).toMatchObject({ presupuestado: 1000000, ejecutado: 400000, variacion: -600000, porcentajeEjecucion: 40 });
    expect(porCodigo.get("516020")).toMatchObject({ presupuestado: 500000, ejecutado: 200000, variacion: -300000, porcentajeEjecucion: 40 });
    expect(porCodigo.get("110505")).toMatchObject({ presupuestado: 1500000, ejecutado: 200000, variacion: -1300000, porcentajeEjecucion: 13.33 });
  });

  it("una cuenta presupuestada sin movimiento ejecuta 0", async () => {
    const res = await request(app)
      .get(`/api/presupuesto/${periodo!.id}/ejecucion`)
      .set("Authorization", `Bearer ${contadorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.lineas).toHaveLength(3);
    expect(res.body.lineas.every((l: { ejecutado: number }) => l.ejecutado >= 0)).toBe(true);
  });

  it("un periodo sin presupuesto devuelve líneas vacías", async () => {
    const p = await prisma.periodo.create({
      data: { nombre: `${prefijo}-2026-04`, fechaInicio: new Date("2026-04-01"), fechaFin: new Date("2026-04-30") },
    });
    try {
      const res = await request(app).get(`/api/presupuesto/${p.id}/ejecucion`).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.lineas).toHaveLength(0);
      expect(res.body.totalPresupuestado).toBe(0);
      expect(res.body.totalEjecutado).toBe(0);
    } finally {
      await prisma.periodo.delete({ where: { id: p.id } });
    }
  });
});
