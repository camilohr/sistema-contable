import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["af-admin@test.local", "af-aux@test.local"];
const suf = Date.now();

let adminToken = "";
let auxToken = "";

let cuentaActivoId = 0;
let cuentaAcumId = 0;
let cuentaGastoId = 0;
let cuentaPadreId = 0;

let periodoP1 = 0; // abierto (agosto 2026)
let periodoCerrado = 0;
let periodoP2 = 0; // abierto
let periodoP3 = 0; // abierto (historial y "sin activos")

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

function activoBody(extra: Record<string, unknown> = {}) {
  return {
    cuentaId: cuentaActivoId,
    cuentaDepreciacionId: cuentaAcumId,
    cuentaGastoId,
    nombre: `Computador ${Math.floor(Math.random() * 100000)}`,
    fechaAdquisicion: "2026-01-10",
    valor: 1200000,
    vidaUtilMeses: 12,
    valorResidual: 0,
    ...extra,
  };
}

async function crearActivo(extra: Record<string, unknown> = {}, token = adminToken) {
  return request(app).post("/api/activos-fijos").set("Authorization", `Bearer ${token}`).send(activoBody(extra));
}

async function estadoDe(activoId: number) {
  const a = await prisma.activoFijo.findUnique({ where: { id: activoId } });
  return a ? { estado: a.estado, acumulada: Number(a.depreciacionAcumulada) } : null;
}

// Deja activo únicamente el activo indicado (o ninguno si se pasa 0).
async function dejarSoloActivo(activoId: number) {
  if (activoId) {
    await prisma.activoFijo.updateMany({ where: { id: { not: activoId } }, data: { estado: "DADO_DE_BAJA" } });
  } else {
    await prisma.activoFijo.updateMany({ data: { estado: "DADO_DE_BAJA" } });
  }
}

beforeAll(async () => {
  await prisma.depreciacion.deleteMany({});
  await prisma.activoFijo.deleteMany({});
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  await prisma.usuario.create({ data: { nombre: "AF Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "AF Aux", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminToken = await login(emails[0], "clave123");
  auxToken = await login(emails[1], "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["152005", "159625", "516020", "1520"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cuentaActivoId = porCodigo.get("152005")!;
  cuentaAcumId = porCodigo.get("159625")!;
  cuentaGastoId = porCodigo.get("516020")!;
  cuentaPadreId = porCodigo.get("1520")!;
  if (!cuentaActivoId || !cuentaAcumId || !cuentaGastoId) {
    throw new Error("Faltan cuentas PUC 152005/159625/516020 (ejecutar npm run db:seed)");
  }

  const crearPeriodo = async (estado: string) => {
    const p = await prisma.periodo.create({
      data: {
        nombre: `AF-${suf}-${Math.floor(Math.random() * 100000)}`,
        fechaInicio: new Date("2026-08-01"),
        fechaFin: new Date("2026-08-31"),
        estado: estado as "ABIERTO" | "CERRADO",
      },
    });
    return p.id;
  };
  periodoP1 = await crearPeriodo("ABIERTO");
  periodoCerrado = await crearPeriodo("CERRADO");
  periodoP2 = await crearPeriodo("ABIERTO");
  periodoP3 = await crearPeriodo("ABIERTO");
});

afterAll(async () => {
  await prisma.depreciacion.deleteMany({});
  await prisma.activoFijo.deleteMany({});
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Depreciación" } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Baja" } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `AF-${suf}` } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: emails } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Activos fijos: creación", () => {
  it("ADMIN crea un activo válido (201)", async () => {
    const res = await crearActivo();
    expect(res.status).toBe(201);
    expect(res.body.valor).toBe(1200000);
    expect(res.body.estado).toBe("ACTIVO");
    expect(res.body.depreciacionAcumulada).toBe(0);
    expect(res.body.vidaUtilMeses).toBe(12);
    expect(res.body.codigoCuenta).toBe("152005");
  });

  it("rechaza cuenta que no permite movimiento (400)", async () => {
    const res = await crearActivo({ cuentaId: cuentaPadreId });
    expect(res.status).toBe(400);
  });

  it("rechaza cuenta inexistente (400)", async () => {
    const res = await crearActivo({ cuentaDepreciacionId: 999999 });
    expect(res.status).toBe(400);
  });

  it("rechaza vida útil 0 (400)", async () => {
    const res = await crearActivo({ vidaUtilMeses: 0 });
    expect(res.status).toBe(400);
  });

  it("AUXILIAR no puede crear (403)", async () => {
    const res = await crearActivo({}, auxToken);
    expect(res.status).toBe(403);
  });

  it("AUXILIAR puede listar (200)", async () => {
    const res = await request(app).get("/api/activos-fijos").set("Authorization", `Bearer ${auxToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("Activos fijos: depreciación", () => {
  let activoId = 0;

  it("deprecia el periodo abierto y genera asiento balanceado (201)", async () => {
    const creado = await crearActivo({ valor: 1200000, vidaUtilMeses: 12 });
    activoId = creado.body.id;
    await dejarSoloActivo(activoId);

    const res = await request(app)
      .post(`/api/activos-fijos/depreciar/${periodoP1}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.procesados).toBe(1);
    expect(res.body.comprobante.totalDebito).toBe(100000);
    expect(res.body.comprobante.totalCredito).toBe(100000);
    expect(res.body.comprobante.numAsientos).toBe(2);

    const dep = await prisma.depreciacion.findUnique({ where: { activoId_periodoId: { activoId, periodoId: periodoP1 } } });
    expect(dep).toBeTruthy();
    expect(Number(dep!.valor)).toBe(100000);

    const estado = await estadoDe(activoId);
    expect(estado!.acumulada).toBe(100000);
    expect(estado!.estado).toBe("ACTIVO");
  });

  it("no permite depreciar dos veces el mismo periodo (400)", async () => {
    const res = await request(app)
      .post(`/api/activos-fijos/depreciar/${periodoP1}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("bloquea depreciación en periodo cerrado (400)", async () => {
    const creado = await crearActivo();
    await dejarSoloActivo(creado.body.id);
    const res = await request(app)
      .post(`/api/activos-fijos/depreciar/${periodoCerrado}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    await prisma.activoFijo.update({ where: { id: creado.body.id }, data: { estado: "DADO_DE_BAJA" } });
  });

  it("AUXILIAR no puede depreciar (403)", async () => {
    const res = await request(app)
      .post(`/api/activos-fijos/depreciar/${periodoP2}`)
      .set("Authorization", `Bearer ${auxToken}`);
    expect(res.status).toBe(403);
  });

  it("marca DEPRECIADO_TOTAL al completar la vida útil", async () => {
    await dejarSoloActivo(0);
    const creado = await crearActivo({ valor: 100, vidaUtilMeses: 1 });
    const res = await request(app)
      .post(`/api/activos-fijos/depreciar/${periodoP2}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    const estado = await estadoDe(creado.body.id);
    expect(estado!.acumulada).toBe(100);
    expect(estado!.estado).toBe("DEPRECIADO_TOTAL");
  });

  it("no hay activos vigentes por depreciar (400)", async () => {
    await dejarSoloActivo(0);
    const res = await request(app)
      .post(`/api/activos-fijos/depreciar/${periodoP3}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("Activos fijos: historial", () => {
  it("lista el historial de depreciación del activo", async () => {
    await dejarSoloActivo(0);
    const creado = await crearActivo({ valor: 600000, vidaUtilMeses: 12 });
    await dejarSoloActivo(creado.body.id);
    const dep = await request(app)
      .post(`/api/activos-fijos/depreciar/${periodoP3}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(dep.status).toBe(201);

    const res = await request(app)
      .get(`/api/activos-fijos/${creado.body.id}/depreciaciones`)
      .set("Authorization", `Bearer ${auxToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(Number(res.body[0].valor)).toBe(50000);
  });
});

describe("Activos fijos: baja", () => {
  it("da de baja un activo con asiento balanceado (201)", async () => {
    const creado = await crearActivo({ valor: 1200000 });
    const activoId = creado.body.id;
    await prisma.activoFijo.update({
      where: { id: activoId },
      data: { depreciacionAcumulada: 200000 },
    });

    const res = await request(app)
      .post(`/api/activos-fijos/${activoId}/baja`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ periodoId: periodoP1, fecha: "2026-08-15", concepto: "Baja por venta" });
    expect(res.status).toBe(201);
    expect(res.body.comprobante.totalDebito).toBe(1200000);
    expect(res.body.comprobante.totalCredito).toBe(1200000);
    expect(res.body.comprobante.numAsientos).toBe(3);
    expect(res.body.activo.valorLibros).toBe(1000000);
    expect(res.body.activo.estado).toBe("DADO_DE_BAJA");

    const estado = await estadoDe(activoId);
    expect(estado!.estado).toBe("DADO_DE_BAJA");
  });

  it("no permite dar de baja dos veces (400)", async () => {
    const creado = await crearActivo();
    const activoId = creado.body.id;
    await request(app)
      .post(`/api/activos-fijos/${activoId}/baja`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ periodoId: periodoP1, fecha: "2026-08-15", concepto: "Baja" });
    const res = await request(app)
      .post(`/api/activos-fijos/${activoId}/baja`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ periodoId: periodoP1, fecha: "2026-08-16", concepto: "Baja" });
    expect(res.status).toBe(400);
  });

  it("bloquea baja en periodo cerrado (400)", async () => {
    const creado = await crearActivo();
    const res = await request(app)
      .post(`/api/activos-fijos/${creado.body.id}/baja`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ periodoId: periodoCerrado, fecha: "2026-08-15", concepto: "Baja" });
    expect(res.status).toBe(400);
    await prisma.activoFijo.update({ where: { id: creado.body.id }, data: { estado: "DADO_DE_BAJA" } });
  });

  it("AUXILIAR no puede dar de baja (403)", async () => {
    const creado = await crearActivo();
    const res = await request(app)
      .post(`/api/activos-fijos/${creado.body.id}/baja`)
      .set("Authorization", `Bearer ${auxToken}`)
      .send({ periodoId: periodoP1, fecha: "2026-08-15", concepto: "Baja" });
    expect(res.status).toBe(403);
    await prisma.activoFijo.update({ where: { id: creado.body.id }, data: { estado: "DADO_DE_BAJA" } });
  });
});
