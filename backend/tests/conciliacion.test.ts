import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import { empresaDePrueba } from "./helpers.js";
import { crearProcesoConPlantilla } from "../src/lib/procesos.js";
import bcrypt from "bcryptjs";

const app = createApp();
const emails = ["adminconc@test.local", "auxconc@test.local"];

let adminToken = "";
let auxToken = "";
let adminId = 0;
let auxId = 0;
let bancoId = 0;
let cajaId = 0;
let periodoId = 0;
let conciliacionId = 0;

const CSV = [
  "Fecha;Referencia;Descripcion;Debito;Credito;Saldo",
  "02/12/2026;CON001;Consignacion aporte;500000;0;500000",
  "10/12/2026;CON002;Consignacion cliente;200000;0;700000",
  "15/12/2026;RET001;Retiro cajero;0;100000;600000",
].join("\n");

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

async function crearComprobanteBanco() {
  const consecutivo = (await prisma.comprobante.count({ where: { tipo: "DIARIO" } })) + 1;
  return prisma.comprobante.create({
    data: {
      tipo: "DIARIO",
      fecha: new Date("2026-12-12"),
      periodoId,
      concepto: "Movimientos bancarios conciliacion",
      estado: "CONTABILIZADO",
      consecutivo,
      totalDebito: 800000,
      totalCredito: 800000,
      usuarioCreoId: adminId,
      asientos: {
        create: [
          { cuentaId: bancoId, debito: 500000, credito: 0 },
          { cuentaId: cajaId, debito: 0, credito: 500000 },
          { cuentaId: bancoId, debito: 200000, credito: 0 },
          { cuentaId: cajaId, debito: 0, credito: 200000 },
          { cuentaId: cajaId, debito: 100000, credito: 0 },
          { cuentaId: bancoId, debito: 0, credito: 100000 },
        ],
      },
    },
  });
}

beforeAll(async () => {
  const idsPrevios = (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
  await prisma.procesoContable.deleteMany({});
  await prisma.conciliacion.deleteMany({});
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: idsPrevios } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  await prisma.usuario.create({ data: { nombre: "Admin Conciliacion", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "Aux Conciliacion", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email: emails[0] }, select: { id: true } })).id;
  auxId = (await prisma.usuario.findUniqueOrThrow({ where: { email: emails[1] }, select: { id: true } })).id;
  adminToken = await login(emails[0], "clave123");
  auxToken = await login(emails[1], "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["1110", "110505"] } } });
  bancoId = cuentas.find((c) => c.codigo === "1110")!.id;
  cajaId = cuentas.find((c) => c.codigo === "110505")!.id;

  const periodo = await prisma.periodo.create({
    data: { nombre: "2026-12", fechaInicio: new Date("2026-12-01"), fechaFin: new Date("2026-12-31") },
  });
  periodoId = periodo.id;

  await crearComprobanteBanco();
  await crearProcesoConPlantilla(prisma, await empresaDePrueba(), 2026);
});

afterAll(async () => {
  await prisma.procesoContable.deleteMany({});
  await prisma.conciliacion.deleteMany({});
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, auxId] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Conciliación bancaria", () => {
  it("crea la conciliación del periodo con el saldo en libros", async () => {
    const res = await request(app).post("/api/conciliaciones").set("Authorization", `Bearer ${adminToken}`).send({ periodoId });
    expect(res.status).toBe(201);
    expect(Number(res.body.saldoLibros)).toBe(600000);
    expect(res.body.estado).toBe("EN_PROCESO");
    conciliacionId = res.body.id;
  });

  it("importa el extracto CSV, cruza por monto y deja la diferencia", async () => {
    const res = await request(app)
      .post("/api/conciliaciones/importar")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("periodoId", String(periodoId))
      .attach("archivo", Buffer.from(CSV, "utf8"), "extracto.csv");
    expect(res.status).toBe(201);
    expect(res.body.importadas).toBe(3);
    expect(res.body.totalArchivo).toBe(3);
    expect(res.body.conciliados).toBe(3);
    expect(res.body.movimientos).toBe(3);
    expect(res.body.conciliacion.diferencia).toBe(0);
    expect(Number(res.body.conciliacion.saldoExtracto)).toBe(600000);
  });

  it("detalle incluye los movimientos del extracto", async () => {
    const res = await request(app).get(`/api/conciliaciones/${conciliacionId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("EN_PROCESO");
    expect(res.body.movimientos.length).toBe(3);
    expect(res.body.movimientos.every((m: { conciliado: boolean }) => m.conciliado)).toBe(true);
  });

  it("listar devuelve las conciliaciones del periodo", async () => {
    const res = await request(app).get(`/api/conciliaciones?periodoId=${periodoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].periodo.nombre).toBe("2026-12");
  });

  it("aprueba la conciliación, marca la actividad y audita", async () => {
    const res = await request(app).post(`/api/conciliaciones/${conciliacionId}/aprobar`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("APROBADA");
    expect(res.body.aprobadaEn).toBeTruthy();

    const actividad = await prisma.actividadProceso.findFirst({
      where: { tipo: "CONCILIACION", proceso: { anio: 2026 } },
      select: { estado: true, fechaReal: true },
    });
    expect(actividad?.estado).toBe(true);
    expect(actividad?.fechaReal).toBeTruthy();

    const auditoria = await prisma.auditoria.findFirst({ where: { accion: "APROBAR_CONCILIACION", entidadId: String(conciliacionId) } });
    expect(auditoria).not.toBeNull();
  });

  it("rechaza aprobar una conciliación ya aprobada (409)", async () => {
    const res = await request(app).post(`/api/conciliaciones/${conciliacionId}/aprobar`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });

  it("reimportar es idempotente (no duplica) y permite anular", async () => {
    const res = await request(app)
      .post("/api/conciliaciones/importar")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("periodoId", String(periodoId))
      .attach("archivo", Buffer.from(CSV, "utf8"), "extracto.csv");
    expect(res.status).toBe(201);
    expect(res.body.importadas).toBe(0);
    expect(res.body.totalArchivo).toBe(3);

    const anulada = await request(app).post(`/api/conciliaciones/${conciliacionId}/anular`).set("Authorization", `Bearer ${adminToken}`);
    expect(anulada.status).toBe(200);
    expect(anulada.body.estado).toBe("ANULADA");
  });

  it("AUXILIAR no puede crear, importar ni aprobar (403)", async () => {
    const crear = await request(app).post("/api/conciliaciones").set("Authorization", `Bearer ${auxToken}`).send({ periodoId });
    expect(crear.status).toBe(403);
    const importar = await request(app)
      .post("/api/conciliaciones/importar")
      .set("Authorization", `Bearer ${auxToken}`)
      .field("periodoId", String(periodoId))
      .attach("archivo", Buffer.from(CSV, "utf8"), "extracto.csv");
    expect(importar.status).toBe(403);
    const aprobar = await request(app).post(`/api/conciliaciones/${conciliacionId}/aprobar`).set("Authorization", `Bearer ${auxToken}`);
    expect(aprobar.status).toBe(403);
  });

  it("exige autenticación (401)", async () => {
    const res = await request(app).get("/api/conciliaciones");
    expect(res.status).toBe(401);
  });

  it("rechaza un CSV sin filas válidas (400)", async () => {
    const res = await request(app)
      .post("/api/conciliaciones/importar")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("periodoId", String(periodoId))
      .attach("archivo", Buffer.from(";;;\n;;;", "utf8"), "vacio.csv");
    expect(res.status).toBe(400);
  });
});

