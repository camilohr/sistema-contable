import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import bcrypt from "bcryptjs";

const app = createApp();

const email = "admin7@test.local";
let token = "";
let adminId = 0;
let periodoId = 0;
let clienteId = "";
let proveedorId = "";
let comprobanteId = 0;

async function login(): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: "clave123" });
  return res.body.token;
}

beforeAll(async () => {
  await prisma.recibo.deleteMany({});
  await prisma.pago.deleteMany({});
  await prisma.cuentaPorCobrar.deleteMany({});
  await prisma.cuentaPorPagar.deleteMany({});
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE7CC", "FASE7NIT"] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });
  await prisma.consecutivo.deleteMany({});

  await prisma.usuario.create({ data: { nombre: "Admin 7", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  token = await login();

  const cliente = await prisma.tercero.create({
    data: { tipo: "CLIENTE", tipoDocumento: "CC", documento: "FASE7CC", nombreRazonSocial: "Cliente Fase 7" },
  });
  clienteId = cliente.id;
  const proveedor = await prisma.tercero.create({
    data: { tipo: "PROVEEDOR", tipoDocumento: "NIT", documento: "FASE7NIT", nombreRazonSocial: "Proveedor Fase 7" },
  });
  proveedorId = proveedor.id;

  const periodo = await prisma.periodo.create({
    data: { nombre: "2026-12", fechaInicio: new Date("2026-12-01"), fechaFin: new Date("2026-12-31") },
  });
  periodoId = periodo.id;

  const caja = await prisma.cuenta.findUniqueOrThrow({ where: { codigo: "110505" } });
  const ing = await prisma.cuenta.findUniqueOrThrow({ where: { codigo: "4120" } });
  const comp = await prisma.comprobante.create({
    data: {
      tipo: "DIARIO",
      consecutivo: 1,
      fecha: new Date("2026-12-03"),
      periodoId,
      concepto: "Venta",
      totalDebito: 1000,
      totalCredito: 1000,
      estado: "CONTABILIZADO",
      usuarioCreoId: adminId,
      asientos: { create: [{ cuentaId: caja.id, debito: 1000 }, { cuentaId: ing.id, credito: 1000 }] },
    },
  });
  comprobanteId = comp.id;
});

afterAll(async () => {
  await prisma.recibo.deleteMany({});
  await prisma.pago.deleteMany({});
  await prisma.cuentaPorCobrar.deleteMany({});
  await prisma.cuentaPorPagar.deleteMany({});
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE7CC", "FASE7NIT"] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });
  await prisma.consecutivo.deleteMany({});
  await prisma.$disconnect();
});

describe("Cuentas por cobrar", () => {
  it("crea una CxC pendiente con saldo igual al valor", async () => {
    const res = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: clienteId, numeroDocumento: "FV-001", fechaEmision: "2026-12-01", fechaVencimiento: "2026-12-15", valor: 500000, comprobanteId });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("PENDIENTE");
    expect(res.body.saldo).toBe(500000);
  });

  it("rechaza vencimiento anterior a la emisión (400)", async () => {
    const res = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: clienteId, numeroDocumento: "FV-002", fechaEmision: "2026-12-10", fechaVencimiento: "2026-12-01", valor: 1000 });
    expect(res.status).toBe(400);
  });

  it("rechaza comprobante inexistente (400)", async () => {
    const res = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: clienteId, numeroDocumento: "FV-003", fechaEmision: "2026-12-01", fechaVencimiento: "2026-12-15", valor: 1000, comprobanteId: 999999 });
    expect(res.status).toBe(400);
  });

  it("marca ABONADA con abono parcial y CANCELADA con abono total", async () => {
    const cxc = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: clienteId, numeroDocumento: "FV-004", fechaEmision: "2026-12-01", fechaVencimiento: "2026-12-15", valor: 600000 });
    expect(cxc.body.estado).toBe("PENDIENTE");

    const parcial = await request(app)
      .post(`/api/cxc/${cxc.body.id}/recibos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 200000, formaPago: "EFECTIVO", fecha: "2026-12-05" });
    expect(parcial.status).toBe(201);
    expect(parcial.body.abono.numero).toMatch(/^R-\d{4}$/);
    expect(parcial.body.documento.estado).toBe("ABONADA");
    expect(parcial.body.documento.saldo).toBe(400000);

    const total = await request(app)
      .post(`/api/cxc/${cxc.body.id}/recibos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 400000 });
    expect(total.body.documento.estado).toBe("CANCELADA");
    expect(total.body.documento.saldo).toBe(0);
  });

  it("rechaza abono que supera el saldo (400)", async () => {
    const cxc = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: clienteId, numeroDocumento: "FV-005", fechaEmision: "2026-12-01", fechaVencimiento: "2026-12-15", valor: 100000 });
    const res = await request(app)
      .post(`/api/cxc/${cxc.body.id}/recibos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 200000 });
    expect(res.status).toBe(400);
  });

  it("muestra VENCIDA cuando pasó la fecha de vencimiento", async () => {
    const cxc = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: clienteId, numeroDocumento: "FV-006", fechaEmision: "2026-01-01", fechaVencimiento: "2026-01-10", valor: 50000 });
    expect(cxc.body.estado).toBe("VENCIDA");
  });

  it("no permite eliminar un documento con abonos (400)", async () => {
    const cxc = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: clienteId, numeroDocumento: "FV-007", fechaEmision: "2026-12-01", fechaVencimiento: "2026-12-15", valor: 100000 });
    await request(app).post(`/api/cxc/${cxc.body.id}/recibos`).set("Authorization", `Bearer ${token}`).send({ valor: 100000 });
    const res = await request(app).delete(`/api/cxc/${cxc.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("elimina un documento sin abonos", async () => {
    const cxc = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: clienteId, numeroDocumento: "FV-008", fechaEmision: "2026-12-01", fechaVencimiento: "2026-12-15", valor: 100000 });
    const res = await request(app).delete(`/api/cxc/${cxc.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("filtra por estado en el listado", async () => {
    const res = await request(app).get("/api/cxc?estado=PENDIENTE").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.every((d: { estado: string }) => d.estado === "PENDIENTE")).toBe(true);
  });

  it("exige autenticación (401)", async () => {
    const res = await request(app).get("/api/cxc");
    expect(res.status).toBe(401);
  });
});

describe("Cuentas por pagar", () => {
  it("crea una CxP y la cancela con pagos", async () => {
    const cxp = await request(app)
      .post("/api/cxp")
      .set("Authorization", `Bearer ${token}`)
      .send({ terceroId: proveedorId, numeroDocumento: "CP-001", fechaEmision: "2026-12-01", fechaVencimiento: "2026-12-20", valor: 300000 });
    expect(cxp.status).toBe(201);
    expect(cxp.body.saldo).toBe(300000);

    const pago = await request(app)
      .post(`/api/cxp/${cxp.body.id}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 300000, formaPago: "TRANSFERENCIA" });
    expect(pago.status).toBe(201);
    expect(pago.body.abono.numero).toMatch(/^P-\d{4}$/);
    expect(pago.body.documento.estado).toBe("CANCELADA");
  });
});
