import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const email = "paginacion@test.local";
const suf = String(Date.now()).slice(-6);
const pref = `PAG${suf}`;

let token = "";
let clienteId = "";
let cuentaActivoId = 0;
let cuentaAcumId = 0;
let cuentaGastoId = 0;

async function login(): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: "clave123" });
  return res.body.token;
}

async function crearTercero(i: number) {
  return request(app)
    .post("/api/terceros")
    .set("Authorization", `Bearer ${token}`)
    .send({ tipo: "CLIENTE", tipoDocumento: "CC", documento: `1${suf}${i}`, nombreRazonSocial: `Cliente Pag ${i}` });
}

async function crearProducto(i: number) {
  return request(app)
    .post("/api/productos")
    .set("Authorization", `Bearer ${token}`)
    .send({ codigo: `${pref}-P${i}`, nombre: `Producto Pag ${i}`, unidad: "und" });
}

async function crearActivo(i: number) {
  return request(app)
    .post("/api/activos-fijos")
    .set("Authorization", `Bearer ${token}`)
    .send({
      cuentaId: cuentaActivoId,
      cuentaDepreciacionId: cuentaAcumId,
      cuentaGastoId,
      nombre: `Activo Pag ${i}`,
      fechaAdquisicion: "2026-01-10",
      valor: 1200000,
      vidaUtilMeses: 12,
      valorResidual: 0,
    });
}

async function crearCxC(documento: string) {
  return request(app)
    .post("/api/cxc")
    .set("Authorization", `Bearer ${token}`)
    .send({ terceroId: clienteId, numeroDocumento: documento, fechaEmision: "2026-12-01", fechaVencimiento: "2030-12-01", valor: 100000 });
}

beforeAll(async () => {
  await prisma.recibo.deleteMany({});
  await prisma.pago.deleteMany({});
  await prisma.cuentaPorCobrar.deleteMany({});
  await prisma.cuentaPorPagar.deleteMany({});
  await prisma.activoFijo.deleteMany({});
  await prisma.producto.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { startsWith: `1${suf}` } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: [email] } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });

  await prisma.usuario.create({ data: { nombre: "Admin Paginación", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  token = await login();

  for (let i = 0; i < 3; i++) {
    const res = await crearTercero(i);
    expect(res.status).toBe(201);
    if (i === 0) clienteId = res.body.id;
  }

  for (let i = 0; i < 3; i++) {
    const res = await crearProducto(i);
    expect(res.status).toBe(201);
  }

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["152005", "159625", "516020"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cuentaActivoId = porCodigo.get("152005")!;
  cuentaAcumId = porCodigo.get("159625")!;
  cuentaGastoId = porCodigo.get("516020")!;
  if (!cuentaActivoId || !cuentaAcumId || !cuentaGastoId) {
    throw new Error("Faltan cuentas PUC 152005/159625/516020 (ejecutar npm run db:seed)");
  }

  for (let i = 0; i < 3; i++) {
    const res = await crearActivo(i);
    expect(res.status).toBe(201);
  }

  for (let i = 0; i < 4; i++) {
    const res = await crearCxC(`${pref}-C${i}`);
    expect(res.status).toBe(201);
  }

  const cancelada = await prisma.cuentaPorCobrar.findFirstOrThrow({ where: { numeroDocumento: `${pref}-C0` } });
  await prisma.cuentaPorCobrar.update({ where: { id: cancelada.id }, data: { estado: "CANCELADA", saldo: 0 } });
});

afterAll(async () => {
  await prisma.recibo.deleteMany({});
  await prisma.pago.deleteMany({});
  await prisma.cuentaPorCobrar.deleteMany({});
  await prisma.cuentaPorPagar.deleteMany({});
  await prisma.activoFijo.deleteMany({});
  await prisma.producto.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { startsWith: `1${suf}` } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: [email] } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });
  await prisma.$disconnect();
});

describe("Paginación: terceros", () => {
  it("sin parámetros devuelve el array plano como antes", async () => {
    const res = await request(app).get("/api/terceros").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it("devuelve el envelope con page/pageSize", async () => {
    const plano = await request(app).get("/api/terceros").set("Authorization", `Bearer ${token}`);
    const total = plano.body.length;

    const p1 = await request(app).get("/api/terceros?page=1&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(p1.status).toBe(200);
    expect(Array.isArray(p1.body)).toBe(false);
    expect(p1.body.items.length).toBe(2);
    expect(p1.body.total).toBe(total);
    expect(p1.body.page).toBe(1);
    expect(p1.body.pageSize).toBe(2);
    expect(p1.body.pages).toBe(Math.ceil(total / 2));

    const p2 = await request(app).get("/api/terceros?page=2").set("Authorization", `Bearer ${token}`);
    expect(p2.status).toBe(200);
    expect(Array.isArray(p2.body)).toBe(false);
    expect(p2.body.items.length).toBe(Math.max(0, total - 10));
    expect(p2.body.page).toBe(2);
    expect(p2.body.pageSize).toBe(10);
    expect(p2.body.pages).toBe(Math.ceil(total / 10));
  });

  it("los items de páginas distintas no se repiten", async () => {
    const busqueda = `1${suf}`;
    const p1 = await request(app).get(`/api/terceros?page=1&pageSize=2&busqueda=${busqueda}`).set("Authorization", `Bearer ${token}`);
    const p2 = await request(app).get(`/api/terceros?page=2&pageSize=2&busqueda=${busqueda}`).set("Authorization", `Bearer ${token}`);
    expect(p1.body.items.length).toBe(2);
    expect(p2.body.items.length).toBe(1);
    expect(p2.body.total).toBe(3);
    expect(p2.body.pages).toBe(2);
    expect(p1.body.items.some((t: { id: string }) => t.id === p2.body.items[0].id)).toBe(false);
  });

  it("rechaza page y pageSize inválidos (400)", async () => {
    const r1 = await request(app).get("/api/terceros?page=0&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(r1.status).toBe(400);
    const r2 = await request(app).get("/api/terceros?page=1&pageSize=abc").set("Authorization", `Bearer ${token}`);
    expect(r2.status).toBe(400);
  });
});

describe("Paginación: productos", () => {
  it("sin parámetros devuelve el array plano y paginado entrega el envelope", async () => {
    const plano = await request(app).get("/api/productos").set("Authorization", `Bearer ${token}`);
    expect(Array.isArray(plano.body)).toBe(true);
    const total = plano.body.length;
    expect(total).toBeGreaterThanOrEqual(3);

    const p1 = await request(app).get("/api/productos?page=1&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(p1.status).toBe(200);
    expect(Array.isArray(p1.body)).toBe(false);
    expect(p1.body.items.length).toBe(2);
    expect(p1.body.total).toBe(total);
    expect(p1.body.pages).toBe(Math.ceil(total / 2));

    const p2 = await request(app).get("/api/productos?page=2&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(p2.body.items.length).toBe(total - 2);
    expect(p2.body.page).toBe(2);
  });
});

describe("Paginación: activos fijos", () => {
  it("sin parámetros devuelve el array plano y paginado entrega el envelope", async () => {
    const plano = await request(app).get("/api/activos-fijos").set("Authorization", `Bearer ${token}`);
    expect(Array.isArray(plano.body)).toBe(true);
    const total = plano.body.length;
    expect(total).toBeGreaterThanOrEqual(3);

    const p1 = await request(app).get("/api/activos-fijos?page=1&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(p1.status).toBe(200);
    expect(Array.isArray(p1.body)).toBe(false);
    expect(p1.body.items.length).toBe(2);
    expect(p1.body.total).toBe(total);
    expect(p1.body.pages).toBe(Math.ceil(total / 2));

    const p2 = await request(app).get("/api/activos-fijos?page=2&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(p2.body.items.length).toBe(total - 2);
    expect(p2.body.page).toBe(2);
  });
});

describe("Paginación: cartera", () => {
  it("sin parámetros devuelve el array plano con todos los documentos", async () => {
    const res = await request(app).get("/api/cxc").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);
  });

  it("página los documentos y el total usa el filtro movido a SQL", async () => {
    const p1 = await request(app).get("/api/cxc?page=1&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(Array.isArray(p1.body)).toBe(false);
    expect(p1.body.items.length).toBe(2);
    expect(p1.body.total).toBe(4);
    expect(p1.body.pages).toBe(2);

    const porEstado = await request(app).get("/api/cxc?estado=PENDIENTE&page=1&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(porEstado.status).toBe(200);
    expect(Array.isArray(porEstado.body)).toBe(false);
    expect(porEstado.body.items.length).toBe(2);
    expect(porEstado.body.total).toBe(3);
    expect(porEstado.body.pages).toBe(2);
    expect(porEstado.body.items.every((d: { estado: string }) => d.estado === "PENDIENTE")).toBe(true);

    const porEstadoPlano = await request(app).get("/api/cxc?estado=PENDIENTE").set("Authorization", `Bearer ${token}`);
    expect(Array.isArray(porEstadoPlano.body)).toBe(true);
    expect(porEstadoPlano.body.length).toBe(3);
    expect(porEstadoPlano.body.every((d: { estado: string }) => d.estado === "PENDIENTE")).toBe(true);
  });
});