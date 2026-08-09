import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import { empresaDePrueba } from "./helpers.js";
import { EstadoComprobante } from "@prisma/client";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["cierre-admin@test.local", "cierre-cont@test.local", "cierre-aux@test.local"];
const suf = Date.now();

let adminId = "";
let contadorId = "";
let auxiliarId = "";
let adminToken = "";
let contadorToken = "";
let auxiliarToken = "";

let cajaId = 0;
let bancosId = 0;
let ingresosId = 0;
let gastoId = 0;
let utilidadId = 0;

interface PeriodoTest { id: number; nombre: string }
const periodos2025: PeriodoTest[] = [];
let periodo2023: PeriodoTest | null = null;
let periodo2024: PeriodoTest | null = null;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

function crearComprobante(periodoId: number, fecha: string, concepto: string, asientos: { cuentaId: number; debito?: number; credito?: number }[]) {
  return request(app)
    .post("/api/comprobantes")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ tipo: "DIARIO", fecha, periodoId, concepto, asientos });
}

async function cerrarPeriodo(periodo: PeriodoTest): Promise<void> {
  const res = await request(app)
    .patch(`/api/periodos/${periodo.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ estado: "CERRADO" });
  expect(res.status).toBe(200);
}

async function reabrirPeriodo(periodo: PeriodoTest): Promise<void> {
  const res = await request(app)
    .patch(`/api/periodos/${periodo.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ estado: "ABIERTO" });
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  await prisma.cierreAnual.deleteMany({ where: { anio: { in: [2023, 2024, 2025] } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "CIERRE-" } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Cierre de ejercicio" } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `CIERRE-${suf}` } } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, contadorId] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  const admin = await prisma.usuario.create({ data: { nombre: "Cierre Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  const contador = await prisma.usuario.create({ data: { nombre: "Cierre Contador", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" } });
  const auxiliar = await prisma.usuario.create({ data: { nombre: "Cierre Auxiliar", email: emails[2], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminId = admin.id;
  contadorId = contador.id;
  auxiliarId = auxiliar.id;
  adminToken = await login(emails[0], "clave123");
  contadorToken = await login(emails[1], "clave123");
  auxiliarToken = await login(emails[2], "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "111005", "4120", "516020", "3605"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cajaId = porCodigo.get("110505")!;
  bancosId = porCodigo.get("111005")!;
  ingresosId = porCodigo.get("4120")!;
  gastoId = porCodigo.get("516020")!;
  utilidadId = porCodigo.get("3605")!;

  const crearPeriodo = (nombre: string, fechaInicio: string, fechaFin: string) =>
    prisma.periodo.create({ data: { nombre, fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin) } });

  const p2025a = await crearPeriodo(`CIERRE-${suf}-2025-01`, "2025-01-01", "2025-01-31");
  const p2025b = await crearPeriodo(`CIERRE-${suf}-2025-12`, "2025-12-01", "2025-12-31");
  periodos2025.push({ id: p2025a.id, nombre: p2025a.nombre }, { id: p2025b.id, nombre: p2025b.nombre });
  const p2023 = await crearPeriodo(`CIERRE-${suf}-2023-12`, "2023-12-01", "2023-12-31");
  periodo2023 = { id: p2023.id, nombre: p2023.nombre };
  const p2024 = await crearPeriodo(`CIERRE-${suf}-2024-12`, "2024-12-01", "2024-12-31");
  periodo2024 = { id: p2024.id, nombre: p2024.nombre };

  const c2025a = await crearComprobante(periodos2025[0].id, "2025-01-10", `CIERRE-${suf}-2025-ingreso`, [
    { cuentaId: cajaId, debito: 1000000 },
    { cuentaId: ingresosId, credito: 1000000 },
  ]);
  expect(c2025a.status).toBe(201);
  const c2025b = await crearComprobante(periodos2025[1].id, "2025-12-10", `CIERRE-${suf}-2025-gasto`, [
    { cuentaId: gastoId, debito: 400000 },
    { cuentaId: cajaId, credito: 400000 },
  ]);
  expect(c2025b.status).toBe(201);

  const c2023a = await crearComprobante(periodo2023!.id, "2023-12-10", `CIERRE-${suf}-2023-ingreso`, [
    { cuentaId: cajaId, debito: 500000 },
    { cuentaId: ingresosId, credito: 500000 },
  ]);
  expect(c2023a.status).toBe(201);
  const c2023b = await crearComprobante(periodo2023!.id, "2023-12-20", `CIERRE-${suf}-2023-gasto`, [
    { cuentaId: gastoId, debito: 700000 },
    { cuentaId: cajaId, credito: 700000 },
  ]);
  expect(c2023b.status).toBe(201);

  for (const c of [c2025a, c2025b, c2023a, c2023b]) {
    const cont = await request(app).post(`/api/comprobantes/${c.body.id}/contabilizar`).set("Authorization", `Bearer ${adminToken}`);
    expect(cont.status).toBe(200);
  }
});

afterAll(async () => {
  await prisma.cierreAnual.deleteMany({ where: { anio: { in: [2023, 2024, 2025] } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "CIERRE-" } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Cierre de ejercicio" } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `CIERRE-${suf}` } } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, contadorId, auxiliarId] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Cierre de ejercicio anual: validaciones", () => {
  it("no autenticado recibe 401", async () => {
    const res = await request(app).post("/api/cierre-anual/2025");
    expect(res.status).toBe(401);
  });

  it("solo ADMIN puede ejecutar el cierre (CONTADOR recibe 403)", async () => {
    const res = await request(app).post("/api/cierre-anual/2025").set("Authorization", `Bearer ${contadorToken}`);
    expect(res.status).toBe(403);
  });

  it("AUXILIAR no puede ejecutar el cierre (403)", async () => {
    const res = await request(app).post("/api/cierre-anual/2025").set("Authorization", `Bearer ${auxiliarToken}`);
    expect(res.status).toBe(403);
  });

  it("año inválido recibe 400", async () => {
    const res = await request(app).post("/api/cierre-anual/abc").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("rechaza cerrar un año con periodos abiertos", async () => {
    const res = await request(app).post("/api/cierre-anual/2024").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("periodos abiertos");
  });

  it("rechaza cerrar un año sin periodos", async () => {
    const res = await request(app).post("/api/cierre-anual/2015").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No hay periodos");
  });
});

describe("Cierre de ejercicio anual: ejecución", () => {
  it("cierra 2025 con utilidad y genera asiento balanceado hacia la cuenta 3605", async () => {
    for (const p of periodos2025) await cerrarPeriodo(p);

    const res = await request(app).post("/api/cierre-anual/2025").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);

    const { comprobante, resumen, asientos } = res.body;
    expect(comprobante.concepto).toBe("Cierre de ejercicio 2025");
    expect(comprobante.totalDebito).toBe(comprobante.totalCredito);
    expect(comprobante.totalDebito).toBe(1000000);

    expect(resumen.debitoIngresos).toBe(1000000);
    expect(resumen.creditoGastos).toBe(400000);
    expect(resumen.resultado).toBe(600000);

    const cierreUtilidad = asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "3605");
    expect(cierreUtilidad).toBeTruthy();
    expect(cierreUtilidad.credito).toBe(600000);

    const debitos = asientos.filter((a: { debito: number }) => a.debito > 0);
    const creditos = asientos.filter((a: { credito: number }) => a.credito > 0);
    expect(debitos.reduce((s: number, a: { debito: number }) => s + a.debito, 0)).toBe(
      creditos.reduce((s: number, a: { credito: number }) => s + a.credito, 0)
    );
  });

  it("deja las cuentas de resultado (clases 4-7) en cero después del cierre", async () => {
    const eid = await empresaDePrueba();
    const asientos = await prisma.asiento.findMany({
      where: {
        comprobante: {
          empresaId: eid,
          estado: EstadoComprobante.CONTABILIZADO,
          periodoId: { in: periodos2025.map((p) => p.id) },
        },
      },
      include: { cuenta: { select: { clase: true, codigo: true } } },
    });

    const netoPorCuenta = new Map<number, number>();
    for (const a of asientos) {
      if (a.cuenta.clase >= 4 && a.cuenta.clase <= 7) {
        netoPorCuenta.set(a.cuentaId, (netoPorCuenta.get(a.cuentaId) ?? 0) + a.debito.toNumber() - a.credito.toNumber());
      }
    }
    expect(netoPorCuenta.size).toBeGreaterThan(0);
    for (const [cuentaId, neto] of netoPorCuenta) {
      expect(neto, `cuenta de resultado ${cuentaId} debería quedar en cero`).toBe(0);
    }
  });

  it("no permite cerrar dos veces el mismo año", async () => {
    const res = await request(app).post("/api/cierre-anual/2025").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ya fue cerrado");
  });

  it("registra CERRAR_ANIO en la bitácora de auditoría", async () => {
    const res = await request(app).get("/api/auditoria?entidad=Anio&limite=500").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const reg = res.body.find((r: { entidadId: string; accion: string }) => r.entidadId === "2025" && r.accion === "CERRAR_ANIO");
    expect(reg).toBeTruthy();
    expect(reg.usuario).toBe("Cierre Admin");
    expect(reg.detalle.resultado).toBe(600000);
  });

  it("cierra 2023 con pérdida debitando la cuenta de utilidades", async () => {
    await cerrarPeriodo(periodo2023!);

    const res = await request(app).post("/api/cierre-anual/2023").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);

    expect(res.body.resumen.resultado).toBe(-200000);
    const cierrePerdida = res.body.asientos.find((a: { codigoCuenta: string }) => a.codigoCuenta === "3605");
    expect(cierrePerdida).toBeTruthy();
    expect(cierrePerdida.debito).toBe(200000);
    expect(cierrePerdida.credito).toBe(0);
  });
});

describe("Cierre de ejercicio anual: consultas", () => {
  it("obtiene el detalle de un cierre realizado", async () => {
    const res = await request(app).get("/api/cierre-anual/2025").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.anio).toBe(2025);
    expect(res.body.comprobante.asientos.length).toBeGreaterThan(0);
    expect(res.body.codigoCuentaUtilidad).toBe("3605");
    expect(res.body.usuario).toBe("Cierre Admin");
  });

  it("listar muestra los años cerrados", async () => {
    const res = await request(app).get("/api/cierre-anual").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const anios = res.body.map((c: { anio: number }) => c.anio);
    expect(anios).toContain(2025);
    expect(anios).toContain(2023);
  });

  it("un año no cerrado responde 404", async () => {
    const res = await request(app).get("/api/cierre-anual/2015").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("CONTADOR puede consultar (GET)", async () => {
    const res = await request(app).get("/api/cierre-anual/2025").set("Authorization", `Bearer ${contadorToken}`);
    expect(res.status).toBe(200);
  });
});

describe("Cierre de ejercicio anual: bloqueo de movimientos posteriores", () => {
  it("rechaza la reapertura de un periodo en un año ya cerrado (S1-03/S4-04)", async () => {
    const res = await request(app)
      .patch(`/api/periodos/${periodos2025[0].id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ estado: "ABIERTO" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("año ya cerrado");
  });

  it("rechaza crear comprobante en un periodo de un año cerrado (sin reapertura posible)", async () => {
    const res = await crearComprobante(periodos2025[0].id, "2025-01-15", `CIERRE-${suf}-2025-bloqueado`, [
      { cuentaId: cajaId, debito: 100000 },
      { cuentaId: bancosId, credito: 100000 },
    ]);
    expect(res.status).toBe(400);
  });
});
