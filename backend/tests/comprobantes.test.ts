import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["admin4@test.local", "aux4@test.local"];
let adminToken = "";
let auxToken = "";

let cajaId = 0;
let bancoId = 0;
let ingresosId = 0;
let ivaId = 0;
let clientesId = 0;
let periodoId = 0;
let periodoCerradoId = 0;
let terceroId = "";

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

function asiento(cuentaId: number, part: { debito?: number; credito?: number; terceroId?: string; detalle?: string }) {
  return { cuentaId, ...part };
}

beforeAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE4CC"] } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.consecutivo.deleteMany({});

  await prisma.usuario.create({ data: { nombre: "Admin 4", email: "admin4@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "Aux 4", email: "aux4@test.local", passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminToken = await login("admin4@test.local", "clave123");
  auxToken = await login("aux4@test.local", "clave123");

  const cuentas = await prisma.cuenta.findMany({
    where: { codigo: { in: ["110505", "111005", "4120", "240805", "130505"] } },
  });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cajaId = porCodigo.get("110505")!;
  bancoId = porCodigo.get("111005")!;
  ingresosId = porCodigo.get("4120")!;
  ivaId = porCodigo.get("240805")!;
  clientesId = porCodigo.get("130505")!;

  const tercero = await prisma.tercero.create({
    data: { tipo: "CLIENTE", tipoDocumento: "CE", documento: "FASE4CC", nombreRazonSocial: "Cliente Fase 4" },
  });
  terceroId = tercero.id;

  const periodo = await prisma.periodo.create({
    data: { nombre: "2026-08", fechaInicio: new Date("2026-08-01"), fechaFin: new Date("2026-08-31") },
  });
  periodoId = periodo.id;
  const cerrado = await prisma.periodo.create({
    data: { nombre: "2026-07", fechaInicio: new Date("2026-07-01"), fechaFin: new Date("2026-07-31"), estado: "CERRADO" },
  });
  periodoCerradoId = cerrado.id;
});

afterAll(async () => {
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE4CC"] } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Periodos", () => {
  it("lista periodos con conteo de comprobantes", async () => {
    const res = await request(app).get("/api/periodos").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.some((p: { nombre: string }) => p.nombre === "2026-08")).toBe(true);
  });

  it("crea un periodo válido", async () => {
    const res = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "2026-09", fechaInicio: "2026-09-01", fechaFin: "2026-09-30" });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("ABIERTO");
    await prisma.periodo.delete({ where: { id: res.body.id } });
  });

  it("rechaza nombre duplicado (409)", async () => {
    const res = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "2026-08", fechaInicio: "2026-08-01", fechaFin: "2026-08-31" });
    expect(res.status).toBe(409);
  });

  it("rechaza rango de fechas invertido (400)", async () => {
    const res = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "2026-10", fechaInicio: "2026-10-31", fechaFin: "2026-10-01" });
    expect(res.status).toBe(400);
  });

  it("rechaza a AUXILIAR crear periodos (403)", async () => {
    const res = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${auxToken}`)
      .send({ nombre: "2026-11", fechaInicio: "2026-11-01", fechaFin: "2026-11-30" });
    expect(res.status).toBe(403);
  });
});

describe("Creación de comprobantes", () => {
  it("crea un comprobante cuadrado en borrador", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-03",
        periodoId,
        concepto: "Venta de contado",
        asientos: [
          asiento(cajaId, { debito: 1190000 }),
          asiento(ingresosId, { credito: 1000000 }),
          asiento(ivaId, { credito: 190000 }),
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.consecutivo).toBe(1);
    expect(res.body.estado).toBe("BORRADOR");
    expect(res.body.totalDebito).toBe(1190000);
    expect(res.body.totalCredito).toBe(1190000);
  });

  it("asigna consecutivo correlativo por tipo", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-04",
        periodoId,
        concepto: "Segundo comprobante",
        asientos: [
          asiento(bancoId, { debito: 500000 }),
          asiento(ingresosId, { credito: 500000 }),
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.consecutivo).toBe(2);
  });

  it("rechaza partida descuadrada (400)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-05",
        periodoId,
        concepto: "Descuadrada",
        asientos: [
          asiento(cajaId, { debito: 1000000 }),
          asiento(ingresosId, { credito: 900000 }),
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("partida doble no cuadra");
  });

  it("rechaza asiento en cuenta sin movimiento (400)", async () => {
    const sinMov = await prisma.cuenta.findFirst({ where: { permiteMovimiento: false } });
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-05",
        periodoId,
        concepto: "Cuenta incorrecta",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(sinMov!.id, { credito: 1000 }),
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("no permite movimiento");
  });

  it("rechaza asiento con débito y crédito a la vez (400)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-05",
        periodoId,
        concepto: "Ambos",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(cajaId, { debito: 1000, credito: 1000 }),
        ],
      });
    expect(res.status).toBe(400);
  });

  it("rechaza un comprobante con un solo asiento (sin contrapartida) con mensaje claro", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-05",
        periodoId,
        concepto: "Sin contrapartida",
        asientos: [asiento(cajaId, { debito: 1000000 })],
      });
    expect(res.status).toBe(400);
    const mensajes = JSON.stringify(res.body.detalle ?? {});
    expect(mensajes).toContain("al menos 2 asientos");
  });

  it("rechaza montos negativos en débito (400)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-05",
        periodoId,
        concepto: "Débito negativo",
        asientos: [
          asiento(cajaId, { debito: -1000000 }),
          asiento(ingresosId, { credito: 1000000 }),
        ],
      });
    expect(res.status).toBe(400);
  });

  it("rechaza montos negativos en crédito (400)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-05",
        periodoId,
        concepto: "Crédito negativo",
        asientos: [
          asiento(cajaId, { debito: 1000000 }),
          asiento(ingresosId, { credito: -1000000 }),
        ],
      });
    expect(res.status).toBe(400);
  });

  it("asigna consecutivos distintos a dos creaciones concurrentes del mismo tipo", async () => {
    const cuerpo = {
      tipo: "DIARIO",
      fecha: "2026-08-19",
      periodoId,
      concepto: "Carrera de consecutivo",
      asientos: [
        asiento(cajaId, { debito: 1000 }),
        asiento(ingresosId, { credito: 1000 }),
      ],
    };
    const [a, b] = await Promise.all([
      request(app).post("/api/comprobantes").set("Authorization", `Bearer ${adminToken}`).send(cuerpo),
      request(app).post("/api/comprobantes").set("Authorization", `Bearer ${adminToken}`).send(cuerpo),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const consecutivos = [a.body.consecutivo, b.body.consecutivo].sort((x: number, y: number) => x - y);
    expect(consecutivos[1]).toBe(consecutivos[0] + 1);
  });

  it("rechaza cuenta que no existe (400)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-05",
        periodoId,
        concepto: "Cuenta inexistente",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(999999999, { credito: 1000 }),
        ],
      });
    expect(res.status).toBe(400);
  });

  it("rechaza fecha fuera del periodo (400)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-09-15",
        periodoId,
        concepto: "Fecha incorrecta",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("dentro del periodo");
  });

  it("rechaza periodo cerrado (400)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-07-15",
        periodoId: periodoCerradoId,
        concepto: "Periodo cerrado",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cerrado");
  });

  it("exige tercero cuando la cuenta lo requiere", async () => {
    await prisma.cuenta.update({ where: { id: clientesId }, data: { requiereTercero: true } });
    const sinTercero = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-06",
        periodoId,
        concepto: "Sin tercero",
        asientos: [
          asiento(clientesId, { debito: 500000 }),
          asiento(ingresosId, { credito: 500000 }),
        ],
      });
    expect(sinTercero.status).toBe(400);
    expect(sinTercero.body.error).toContain("requiere asociar un tercero");

    const conTercero = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-06",
        periodoId,
        concepto: "Con tercero",
        asientos: [
          asiento(clientesId, { debito: 500000, terceroId }),
          asiento(ingresosId, { credito: 500000 }),
        ],
      });
    expect(conTercero.status).toBe(201);
    await prisma.cuenta.update({ where: { id: clientesId }, data: { requiereTercero: false } });
  });

  it("rechaza a AUXILIAR crear comprobantes (403)", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${auxToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-05",
        periodoId,
        concepto: "No autorizado",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    expect(res.status).toBe(403);
  });
});

describe("Ciclo de vida del comprobante", () => {
  it("crea siempre en borrador, aunque se envíe estado (C2), y contabiliza después", async () => {
    const res = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "INGRESO",
        fecha: "2026-08-07",
        periodoId,
        concepto: "Ingreso directo",
        estado: "CONTABILIZADO",
        asientos: [
          asiento(cajaId, { debito: 250000 }),
          asiento(ingresosId, { credito: 250000 }),
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("BORRADOR");
    expect(res.body.consecutivo).toBe(1);
    const contab = await request(app)
      .post(`/api/comprobantes/${res.body.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(contab.status).toBe(200);
    expect(contab.body.estado).toBe("CONTABILIZADO");
  });

  it("contabiliza un borrador", async () => {
    const borrador = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-08",
        periodoId,
        concepto: "A contabilizar",
        asientos: [
          asiento(cajaId, { debito: 300000 }),
          asiento(ingresosId, { credito: 300000 }),
        ],
      });
    const res = await request(app)
      .post(`/api/comprobantes/${borrador.body.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("CONTABILIZADO");
  });

  it("no permite contabilizar dos veces (400)", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-09",
        periodoId,
        concepto: "Doble",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    await request(app).post(`/api/comprobantes/${c.body.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`);
    const res = await request(app)
      .post(`/api/comprobantes/${c.body.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("anula un contabilizado y registra usuario y fecha", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-10",
        periodoId,
        concepto: "A anular",
        asientos: [
          asiento(cajaId, { debito: 400000 }),
          asiento(ingresosId, { credito: 400000 }),
        ],
      });
    await request(app).post(`/api/comprobantes/${c.body.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`);
    const res = await request(app)
      .post(`/api/comprobantes/${c.body.id}/anular`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("ANULADO");
    expect(res.body.usuarioAnuloId).toBeTruthy();
    expect(res.body.fechaAnulacion).toBeTruthy();
  });

  it("no permite anular un borrador (400)", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-11",
        periodoId,
        concepto: "Borrador",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    const res = await request(app)
      .post(`/api/comprobantes/${c.body.id}/anular`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("no permite anular dos veces (400)", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-12",
        periodoId,
        concepto: "Doble anulación",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    await request(app).post(`/api/comprobantes/${c.body.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`);
    await request(app).post(`/api/comprobantes/${c.body.id}/anular`).set("Authorization", `Bearer ${adminToken}`);
    const res = await request(app).post(`/api/comprobantes/${c.body.id}/anular`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("edita un borrador (concepto y asientos)", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-13",
        periodoId,
        concepto: "Borrador editable",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    const res = await request(app)
      .patch(`/api/comprobantes/${c.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        concepto: "Editado",
        asientos: [
          asiento(cajaId, { debito: 2000 }),
          asiento(ingresosId, { credito: 2000 }),
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.concepto).toBe("Editado");
    expect(res.body.totalDebito).toBe(2000);
    expect(res.body.asientos.length).toBe(2);
  });

  it("no permite editar un contabilizado (400)", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-14",
        periodoId,
        concepto: "Fijo",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    await request(app).post(`/api/comprobantes/${c.body.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`);
    const res = await request(app)
      .patch(`/api/comprobantes/${c.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ concepto: "No debe" });
    expect(res.status).toBe(400);
  });

  it("elimina un borrador y no reutiliza el consecutivo", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "EGRESO",
        fecha: "2026-08-15",
        periodoId,
        concepto: "A eliminar",
        asientos: [
          asiento(bancoId, { credito: 1000 }),
          asiento(ingresosId, { debito: 1000 }),
        ],
      });
    const consecutivoEliminado = c.body.consecutivo;
    const del = await request(app).delete(`/api/comprobantes/${c.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    const nuevo = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "EGRESO",
        fecha: "2026-08-16",
        periodoId,
        concepto: "Siguiente",
        asientos: [
          asiento(bancoId, { credito: 1000 }),
          asiento(ingresosId, { debito: 1000 }),
        ],
      });
    expect(nuevo.body.consecutivo).toBe(consecutivoEliminado + 1);
  });

  it("no permite eliminar un contabilizado (400)", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-17",
        periodoId,
        concepto: "Contabilizado",
        asientos: [
          asiento(cajaId, { debito: 1000 }),
          asiento(ingresosId, { credito: 1000 }),
        ],
      });
    await request(app).post(`/api/comprobantes/${c.body.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`);
    const res = await request(app).delete(`/api/comprobantes/${c.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("Detalle y listado", () => {
  it("devuelve el detalle con los asientos y nombres de cuenta", async () => {
    const c = await request(app)
      .post("/api/comprobantes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tipo: "DIARIO",
        fecha: "2026-08-18",
        periodoId,
        concepto: "Detalle",
        asientos: [
          asiento(cajaId, { debito: 500000 }),
          asiento(ingresosId, { credito: 500000 }),
        ],
      });
    const res = await request(app).get(`/api/comprobantes/${c.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.asientos.length).toBe(2);
    expect(res.body.asientos[0].codigoCuenta).toBe("110505");
    expect(res.body.asientos[0].debito).toBe(500000);
  });

  it("filtra por tipo, estado y búsqueda", async () => {
    const porTipo = await request(app).get("/api/comprobantes?tipo=INGRESO").set("Authorization", `Bearer ${adminToken}`);
    expect(porTipo.body.length).toBeGreaterThan(0);
    expect(porTipo.body.every((c: { tipo: string }) => c.tipo === "INGRESO")).toBe(true);

    const porEstado = await request(app).get("/api/comprobantes?estado=ANULADO").set("Authorization", `Bearer ${adminToken}`);
    expect(porEstado.body.length).toBeGreaterThan(0);
    expect(porEstado.body.every((c: { estado: string }) => c.estado === "ANULADO")).toBe(true);

    const porBusqueda = await request(app).get("/api/comprobantes?busqueda=Detalle").set("Authorization", `Bearer ${adminToken}`);
    expect(porBusqueda.body.some((c: { concepto: string }) => c.concepto === "Detalle")).toBe(true);
  });

  it("deniega sin token (401)", async () => {
    const res = await request(app).get("/api/comprobantes");
    expect(res.status).toBe(401);
  });
});
