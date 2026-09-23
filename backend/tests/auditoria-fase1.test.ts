import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const email = "adminf1@test.local";
const prefijo = "FASE1";
const nombrePeriodo = "FASE1-2026-05";

let adminToken = "";
let adminId = "";
let cajaId = 0;
let ingresosId = 0;
let periodoId = 0;
let terceroId = "";

async function login(): Promise<string> {
  return (await request(app).post("/api/auth/login").send({ email, password: "clave123" })).body.token;
}

function asiento(cuentaId: number, part: { debito?: number; credito?: number }) {
  return { cuentaId, ...part };
}

function cuerpoComprobante(concepto: string, fecha: string) {
  return {
    tipo: "DIARIO",
    fecha,
    periodoId,
    concepto,
    asientos: [asiento(cajaId, { debito: 1000000 }), asiento(ingresosId, { credito: 1000000 })],
  };
}

async function crearComprobante(concepto: string, fecha: string) {
  const res = await request(app)
    .post("/api/comprobantes")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(cuerpoComprobante(concepto, fecha));
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  await prisma.recibo.deleteMany({});
  await prisma.pago.deleteMany({});
  await prisma.secuencia.deleteMany({});
  await prisma.cuentaPorCobrar.deleteMany({ where: { numeroDocumento: { startsWith: prefijo } } });
  await prisma.cuentaPorPagar.deleteMany({ where: { numeroDocumento: { startsWith: prefijo } } });
  await prisma.comprobante.deleteMany({ where: { periodo: { nombre: nombrePeriodo } } });
  await prisma.periodo.deleteMany({ where: { nombre: nombrePeriodo } });
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE1CC"] } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: [email] } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });

  // limpieza de huellas de otros archivos que usan la secuencia global
  await prisma.recibo.deleteMany({});
  await prisma.pago.deleteMany({});

  await prisma.usuario.create({
    data: { nombre: "Admin Fase 1", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" },
  });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  adminToken = await login();

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "4120"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cajaId = porCodigo.get("110505")!;
  ingresosId = porCodigo.get("4120")!;

  const tercero = await prisma.tercero.create({
    data: { tipo: "CLIENTE", tipoDocumento: "CC", documento: "FASE1CC", nombreRazonSocial: "Cliente Fase 1" },
  });
  terceroId = tercero.id;

  const periodo = await prisma.periodo.create({
    data: { nombre: nombrePeriodo, fechaInicio: new Date("2026-05-01"), fechaFin: new Date("2026-05-31") },
  });
  periodoId = periodo.id;
});

afterAll(async () => {
  await prisma.recibo.deleteMany({});
  await prisma.pago.deleteMany({});
  await prisma.secuencia.deleteMany({});
  await prisma.cuentaPorCobrar.deleteMany({ where: { numeroDocumento: { startsWith: prefijo } } });
  await prisma.cuentaPorPagar.deleteMany({ where: { numeroDocumento: { startsWith: prefijo } } });
  await prisma.comprobante.deleteMany({ where: { periodo: { nombre: nombrePeriodo } } });
  await prisma.periodo.deleteMany({ where: { nombre: nombrePeriodo } });
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE1CC"] } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: [email] } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });
  await prisma.$disconnect();
});

describe("C2: todo comprobante nace en borrador", () => {
  it("ignora estado CONTABILIZADO en la creación (201 + BORRADOR)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...cuerpoComprobante("C2 contabilizado", "2026-05-03"), estado: "CONTABILIZADO" });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("BORRADOR");
  });

  it("ignora estado ANULADO en la creación (201 + BORRADOR)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...cuerpoComprobante("C2 anulado", "2026-05-04"), estado: "ANULADO" });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("BORRADOR");
  });
});

describe("C1: revalidación de periodo abierto dentro de la transacción", () => {
  it("contabilizar registra auditoría CONTABILIZAR", async () => {
    const c = await crearComprobante("C1 auditoria", "2026-05-05");
    const res = await request(app)
      .post(`/api/comprobantes/${c.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("CONTABILIZADO");
    const aud = await prisma.auditoria.findFirst({
      where: { usuarioId: adminId, accion: "CONTABILIZAR", entidad: "Comprobante", entidadId: String(c.id) },
    });
    expect(aud).toBeTruthy();
  });

  it("con el periodo cerrado rechaza contabilizar, anular, editar y eliminar (400) sin mutar", async () => {
    const contab = await crearComprobante("C1 contabilizado", "2026-05-06");
    await request(app)
      .post(`/api/comprobantes/${contab.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    const borrador = await crearComprobante("C1 borrador", "2026-05-07");

    await prisma.periodo.update({ where: { id: periodoId }, data: { estado: "CERRADO" } });

    const anular = await request(app)
      .post(`/api/comprobantes/${contab.id}/anular`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(anular.status).toBe(400);
    expect(anular.body.error).toContain("cerrado");

    const dobleContab = await request(app)
      .post(`/api/comprobantes/${contab.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(dobleContab.status).toBe(400);

    const editar = await request(app)
      .patch(`/api/comprobantes/${borrador.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ concepto: "No debe" });
    expect(editar.status).toBe(400);
    expect(editar.body.error).toContain("cerrado");

    const eliminar = await request(app)
      .delete(`/api/comprobantes/${borrador.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(eliminar.status).toBe(400);

    const trasAnular = await prisma.comprobante.findUniqueOrThrow({ where: { id: contab.id } });
    expect(trasAnular.estado).toBe("CONTABILIZADO");
    expect(trasAnular.usuarioAnuloId).toBeNull();

    const trasEditar = await prisma.comprobante.findUniqueOrThrow({ where: { id: borrador.id } });
    expect(trasEditar.concepto).toBe("C1 borrador");
    expect(await prisma.comprobante.count({ where: { id: borrador.id } })).toBe(1);

    await prisma.periodo.update({ where: { id: periodoId }, data: { estado: "ABIERTO" } });
  });

  it("dos contabilizaciones concurrentes: solo una gana [200, 400]", async () => {
    const c = await crearComprobante("C1 carrera", "2026-05-08");
    const [a, b] = await Promise.all([
      request(app).post(`/api/comprobantes/${c.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`),
      request(app).post(`/api/comprobantes/${c.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);
    const final = await prisma.comprobante.findUniqueOrThrow({ where: { id: c.id } });
    expect(final.estado).toBe("CONTABILIZADO");
  });
});

describe("C4: abonos de cartera atómicos con numeración única", () => {
  async function crearCxC(valor: number, documento: string) {
    const res = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ terceroId, numeroDocumento: documento, fechaEmision: "2026-05-01", fechaVencimiento: "2026-05-20", valor });
    expect(res.status).toBe(201);
    return res.body;
  }

  function abonar(cxcId: number, valor: number) {
    return request(app).post(`/api/cxc/${cxcId}/recibos`).set("Authorization", `Bearer ${adminToken}`).send({ valor });
  }

  it("dos abonos concurrentes que superan el saldo: solo uno aplica [201, 400]", async () => {
    const doc = await crearCxC(100000, "FASE1-001");
    const [a, b] = await Promise.all([abonar(doc.id, 80000), abonar(doc.id, 80000)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);
    const aplico = a.status === 201 ? a : b;
    expect(aplico.body.abono.numero).toMatch(/^R-\d{4}$/);
    const final = await prisma.cuentaPorCobrar.findUniqueOrThrow({ where: { id: doc.id } });
    expect(final.saldo.toNumber()).toBe(20000);
    expect(final.estado).toBe("ABONADA");
  });

  it("dos abonos que agotan el saldo: ambos aplican, números distintos y CANCELADA", async () => {
    const doc = await crearCxC(100000, "FASE1-002");
    const [a, b] = await Promise.all([abonar(doc.id, 50000), abonar(doc.id, 50000)]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.abono.numero).toMatch(/^R-\d{4}$/);
    expect(b.body.abono.numero).toMatch(/^R-\d{4}$/);
    expect(a.body.abono.numero).not.toBe(b.body.abono.numero);
    const final = await prisma.cuentaPorCobrar.findUniqueOrThrow({ where: { id: doc.id } });
    expect(final.saldo.toNumber()).toBe(0);
    expect(final.estado).toBe("CANCELADA");
  });

  it("rechaza un recibo con número duplicado por la restricción única", async () => {
    const existente = await prisma.recibo.findFirstOrThrow({ select: { numero: true, terceroId: true } });
    await expect(
      prisma.recibo.create({
        data: { numero: existente.numero, fecha: new Date("2026-05-10"), terceroId: existente.terceroId, valor: 1000 },
      }),
    ).rejects.toThrow();
  });
});