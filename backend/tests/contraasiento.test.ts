import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const email = "cc9@test.local";
const sufijo = `CS-${Date.now()}`;
let adminToken = "";
let cajaId = 0;
let ingresosId = 0;
let ivaId = 0;
let periodoId = 0;

async function login(user: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email: user, password });
  return res.body.token;
}

async function crearContabilizarYAnular(datos: { fecha: string; concepto: string; asientos: { cuentaId: number; debito?: number; credito?: number }[] }) {
  const creado = await request(app)
    .post("/api/comprobantes")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ tipo: "DIARIO", fecha: datos.fecha, periodoId, concepto: datos.concepto, asientos: datos.asientos });
  await request(app).post(`/api/comprobantes/${creado.body.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`);
  const anulado = await request(app).post(`/api/comprobantes/${creado.body.id}/anular`).set("Authorization", `Bearer ${adminToken}`);
  return { original: creado.body, resAnular: anulado };
}

beforeAll(async () => {
  await prisma.comprobante.deleteMany({ where: { concepto: { contains: sufijo } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: "CS-" } } });
  await prisma.usuario.deleteMany({ where: { email } });

  await prisma.usuario.create({ data: { nombre: "CC Admin", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  adminToken = await login(email, "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "4120", "240805"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cajaId = porCodigo.get("110505")!;
  ingresosId = porCodigo.get("4120")!;
  ivaId = porCodigo.get("240805")!;

  const periodo = await prisma.periodo.create({
    data: { nombre: `CS-${new Date().getUTCFullYear()}-08`, fechaInicio: new Date("2026-08-01"), fechaFin: new Date("2026-08-31") },
  });
  periodoId = periodo.id;
});

afterAll(async () => {
  await prisma.comprobante.deleteMany({ where: { concepto: { contains: sufijo } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: "CS-" } } });
  await prisma.usuario.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Contrasiento (anulación real)", () => {
  it("genera un comprobante inverso CONTABILIZADO vinculado al original", async () => {
    const { original, resAnular } = await crearContabilizarYAnular({
      fecha: "2026-08-05",
      concepto: `${sufijo} Venta contra`,
      asientos: [
        { cuentaId: cajaId, debito: 200000 },
        { cuentaId: ivaId, credito: 32000 },
        { cuentaId: ingresosId, credito: 168000 },
      ],
    });
    expect(resAnular.status).toBe(200);
    expect(resAnular.body.estado).toBe("ANULADO");

    const contra = await prisma.comprobante.findFirstOrThrow({
      where: { comprobanteOrigenId: original.id },
      include: { asientos: true },
    });
    expect(contra.estado).toBe("CONTABILIZADO");
    expect(contra.tipo).toBe("DIARIO");
    expect(contra.periodoId).toBe(periodoId);
    expect(contra.concepto).toContain("Venta contra");
    expect(contra.concepto).toMatch(/^Anulación de D-\d{4}: /);
    expect(Number(contra.totalDebito)).toBe(200000);
    expect(Number(contra.totalCredito)).toBe(200000);
    expect(Number(contra.consecutivo)).toBe(original.consecutivo + 1);

    const originalAsientos = await prisma.asiento.findMany({ where: { comprobanteId: original.id }, orderBy: { id: "asc" } });
    expect(contra.asientos.length).toBe(originalAsientos.length);
    let sumaDebitos = 0;
    let sumaCreditos = 0;
    for (let i = 0; i < contra.asientos.length; i++) {
      const a = contra.asientos[i];
      const par = originalAsientos[i];
      expect(Number(a.debito)).toBe(Number(par.credito));
      expect(Number(a.credito)).toBe(Number(par.debito));
      expect(a.terceroId).toBe(par.terceroId);
      sumaDebitos += Number(a.debito);
      sumaCreditos += Number(a.credito);
    }
    expect(sumaDebitos).toBe(sumaCreditos);
  });

  it("registra el contrasiento en la auditoría de la anulación", async () => {
    const { original } = await crearContabilizarYAnular({
      fecha: "2026-08-06",
      concepto: `${sufijo} Auditoría contra`,
      asientos: [
        { cuentaId: cajaId, debito: 30000 },
        { cuentaId: ingresosId, credito: 30000 },
      ],
    });
    const contra = await prisma.comprobante.findFirstOrThrow({ where: { comprobanteOrigenId: original.id } });
    const log = await prisma.auditoria.findFirstOrThrow({
      where: { entidadId: String(original.id), accion: "ANULAR" },
      orderBy: { id: "desc" },
    });
    const detalle = log.detalle as { consecutivo: number; tipo: string; contrasiento: { id: number; consecutivo: number } };
    expect(detalle.consecutivo).toBe(original.consecutivo);
    expect(detalle.contrasiento.id).toBe(contra.id);
    expect(detalle.contrasiento.consecutivo).toBe(Number(contra.consecutivo));
  });

  it("deja el libro mayor del periodo en saldo cero (original + contrasiento se cancelan)", async () => {
    await crearContabilizarYAnular({
      fecha: "2026-08-07",
      concepto: `${sufijo} Neto cero`,
      asientos: [
        { cuentaId: cajaId, debito: 50000 },
        { cuentaId: ingresosId, credito: 50000 },
      ],
    });
    const res = await request(app)
      .get(`/api/reportes/libro-mayor?periodoId=${periodoId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const caja = res.body.cuentas.find((c: { codigo: string }) => c.codigo === "110505");
    const ingresos = res.body.cuentas.find((c: { codigo: string }) => c.codigo === "4120");
    expect(caja.saldo).toBe(0);
    expect(ingresos.saldo).toBe(0);
  });

  it("no permite anular un comprobante contabilizado dos veces", async () => {
    const { original, resAnular } = await crearContabilizarYAnular({
      fecha: "2026-08-08",
      concepto: `${sufijo} Doble anulación`,
      asientos: [
        { cuentaId: cajaId, debito: 1000 },
        { cuentaId: ingresosId, credito: 1000 },
      ],
    });
    expect(resAnular.status).toBe(200);
    const res = await request(app).post(`/api/comprobantes/${original.id}/anular`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("no permite anular un contrasiento (400)", async () => {
    const { original } = await crearContabilizarYAnular({
      fecha: "2026-08-09",
      concepto: `${sufijo} Contrasiento bloqueado`,
      asientos: [
        { cuentaId: cajaId, debito: 1000 },
        { cuentaId: ingresosId, credito: 1000 },
      ],
    });
    const contra = await prisma.comprobante.findFirstOrThrow({ where: { comprobanteOrigenId: original.id } });
    const res = await request(app).post(`/api/comprobantes/${contra.id}/anular`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No se puede anular un asiento de reversión");
  });
});