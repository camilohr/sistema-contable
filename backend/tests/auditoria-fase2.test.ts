import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import { empresaDePrueba } from "./helpers.js";
import bcrypt from "bcryptjs";
import { derivarPuc } from "../src/lib/puc.js";
import { crearComprobanteDiario } from "../src/lib/comprobantes.js";
import { obtenerSiguienteConsecutivo } from "../src/lib/consecutivo.js";
import type { PrismaClient } from "@prisma/client";

const app = createApp();

const email = "adminf2@test.local";
const PREFIX = "FASE2";
const NOMBRE_PERIODO = `${PREFIX}-2028-01`; // periodo principal (ABIERTO)

let adminToken = "";
let adminId = "";
let empresaId = "";
let cajaId = 0;
let capitalId = 0;
let ingresosId = 0;
let costoVentasId = 0;
let costosProduccionId = 0;
let gastosId = 0;
let cuentaProvisionId = 0;
let cuentaGastoProvisionId = 0;
let terceroId = "";
let periodoId = 0;

async function login(): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: "clave123" });
  return res.body.token;
}

function asiento(cuentaId: number, part: { debito?: number; credito?: number }) {
  return { cuentaId, ...part };
}

async function crearContabilizado(periodo: number, fecha: string, concepto: string, asientos: { cuentaId: number; debito?: number; credito?: number }[]) {
  const consecutivo = await obtenerSiguienteConsecutivo(prisma as unknown as PrismaClient, empresaId, "DIARIO");
  return prisma.comprobante.create({
    data: {
      tipo: "DIARIO",
      fecha: new Date(fecha),
      periodoId: periodo,
      concepto,
      estado: "CONTABILIZADO",
      consecutivo,
      totalDebito: asientos.reduce((s, a) => s + (a.debito ?? 0), 0),
      totalCredito: asientos.reduce((s, a) => s + (a.credito ?? 0), 0),
      usuarioCreoId: adminId,
      asientos: {
        create: asientos.map((a) => ({ cuentaId: a.cuentaId, debito: a.debito ?? 0, credito: a.credito ?? 0 })),
      },
    },
  });
}

async function crearViaApi(concepto: string, fecha: string, asientos: { cuentaId: number; debito?: number; credito?: number }[]) {
  const res = await request(app)
    .post("/api/comprobantes")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ tipo: "DIARIO", fecha, periodoId, concepto, asientos });
  expect(res.status).toBe(201);
  return res.body;
}

async function crearCuenta(codigo: string, nombre: string, opts: { movimiento?: boolean; requiereTercero?: boolean } = {}) {
  return request(app)
    .post("/api/cuentas")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      codigo,
      nombre,
      ...(opts.movimiento ? { permiteMovimiento: true } : {}),
      ...(opts.requiereTercero ? { requiereTercero: true } : {}),
    });
}

async function crearPeriodo(nombre: string, fechaInicio: string, fechaFin: string, estado: string) {
  return prisma.periodo.create({
    data: { nombre, fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin), estado: estado as "ABIERTO" | "CERRADO" },
  });
}

beforeAll(async () => {
  empresaId = await empresaDePrueba();

  await prisma.cuentaPorCobrar.deleteMany({ where: { numeroDocumento: { startsWith: PREFIX } } });
  await prisma.cuentaPorPagar.deleteMany({ where: { numeroDocumento: { startsWith: PREFIX } } });
  await prisma.comprobante.deleteMany({ where: { periodo: { nombre: { startsWith: PREFIX } } } });
  await prisma.provisionCartera.deleteMany({ where: { periodo: { nombre: { startsWith: PREFIX } } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: PREFIX } } });
  await prisma.cuenta.deleteMany({ where: { codigo: { in: ["1999", "199901", "19990101", "199902"] }, empresaId } });
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE2CC"] } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: [email] } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });

  await prisma.usuario.create({
    data: { nombre: "Admin Fase 2", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" },
  });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  adminToken = await login();

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "3105", "4120", "6135", "7105", "510505", "1399", "5199"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  for (const codigo of ["110505", "3105", "4120", "6135", "7105", "510505", "1399", "5199"]) {
    expect(porCodigo.has(codigo), `Falta cuenta PUC ${codigo} (ejecutar npm run db:seed)`).toBe(true);
  }
  cajaId = porCodigo.get("110505")!;
  capitalId = porCodigo.get("3105")!;
  ingresosId = porCodigo.get("4120")!;
  costoVentasId = porCodigo.get("6135")!;
  costosProduccionId = porCodigo.get("7105")!;
  gastosId = porCodigo.get("510505")!;
  cuentaProvisionId = porCodigo.get("1399")!;
  cuentaGastoProvisionId = porCodigo.get("5199")!;

  const tercero = await prisma.tercero.create({
    data: { tipo: "CLIENTE", tipoDocumento: "CC", documento: "FASE2CC", nombreRazonSocial: "Cliente Fase 2" },
  });
  terceroId = tercero.id;

  const periodo = await crearPeriodo(NOMBRE_PERIODO, "2028-01-01", "2028-01-31", "ABIERTO");
  periodoId = periodo.id;
});

afterAll(async () => {
  await prisma.cuentaPorCobrar.deleteMany({ where: { numeroDocumento: { startsWith: PREFIX } } });
  await prisma.cuentaPorPagar.deleteMany({ where: { numeroDocumento: { startsWith: PREFIX } } });
  await prisma.provisionCartera.deleteMany({ where: { periodo: { nombre: { startsWith: PREFIX } } } });
  await prisma.comprobante.deleteMany({ where: { periodo: { nombre: { startsWith: PREFIX } } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: PREFIX } } });
  await prisma.cuenta.deleteMany({ where: { codigo: { in: ["1999", "199901", "19990101", "199902"] }, empresaId } });
  await prisma.tercero.deleteMany({ where: { documento: { in: ["FASE2CC"] } } });
  await prisma.auditoria.deleteMany({ where: { usuario: { email: { in: [email] } } } });
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });
  await prisma.$disconnect();
});

describe("C5: no se puede eliminar cuenta con referencias", () => {
  it("eliminar una cuenta con asientos responde 400 con motivo, y tras anular la referencia se elimina (200)", async () => {
    const padre = await crearCuenta("1999", "FASE2 C5 padre");
    expect(padre.status).toBe(201);
    const padreId = padre.body.id;

    const hija = await crearCuenta("199901", "FASE2 C5 hija", { movimiento: true });
    expect(hija.status).toBe(201);
    expect(hija.body.permiteMovimiento).toBe(true);
    const hijaId = hija.body.id;

    const comp = await crearViaApi("C5 referenciada", "2028-01-10", [
      asiento(cajaId, { debito: 500000 }),
      asiento(hijaId, { credito: 500000 }),
    ]);

    const del = await request(app).delete(`/api/cuentas/${hijaId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(400);
    expect(del.body.error).toContain("referenciada");
    expect(del.body.error).toContain("asiento");

    const liberar = await request(app).delete(`/api/comprobantes/${comp.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(liberar.status).toBe(200);

    const delPost = await request(app).delete(`/api/cuentas/${hijaId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(delPost.status).toBe(200);

    const delPadre = await request(app).delete(`/api/cuentas/${padreId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(delPadre.status).toBe(200);
  });
});

describe("A2: el movimiento se limita a cuentas hoja", () => {
  it("no permite crear subcuentas bajo una cuenta que permite movimiento (400)", async () => {
    const padre = await crearCuenta("1999", "FASE2 A2 padre");
    expect(padre.status).toBe(201);
    const padreId = padre.body.id;

    const hija = await crearCuenta("199901", "FASE2 A2 hija", { movimiento: true });
    expect(hija.status).toBe(201);

    const sub = await crearCuenta("19990101", "FASE2 A2 nieta");
    expect(sub.status).toBe(400);
    expect(sub.body.error).toContain("permite movimiento");

    const patch = await request(app)
      .patch(`/api/cuentas/${padreId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ permiteMovimiento: true });
    expect(patch.status).toBe(400);
    expect(patch.body.error).toContain("subcuentas");

    await request(app).delete(`/api/cuentas/${hija.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    await request(app).delete(`/api/cuentas/${padreId}`).set("Authorization", `Bearer ${adminToken}`);
  });

  it("registra permiteMovimiento al crear una cuenta hoja (201)", async () => {
    const cuenta = await crearCuenta("1999", "FASE2 A2 hoja", { movimiento: true });
    expect(cuenta.status).toBe(201);
    expect(cuenta.body.permiteMovimiento).toBe(true);
    await request(app).delete(`/api/cuentas/${cuenta.body.id}`).set("Authorization", `Bearer ${adminToken}`);
  });
});

describe("A5: rechazo de periodos solapados", () => {
  it("crea un periodo, rechaza el que se solapa (400) y acepta el contiguo (201)", async () => {
    const base = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "FASE2-2028-02", fechaInicio: "2028-02-01", fechaFin: "2028-02-29" });
    expect(base.status).toBe(201);
    expect(base.body.estado).toBe("ABIERTO");

    const solape = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "FASE2-2028-03", fechaInicio: "2028-02-15", fechaFin: "2028-03-15" });
    expect(solape.status).toBe(400);
    expect(solape.body.error).toContain("se solapa");

    const contiguo = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "FASE2-2028-04", fechaInicio: "2028-03-01", fechaFin: "2028-03-31" });
    expect(contiguo.status).toBe(201);

    await prisma.periodo.deleteMany({
      where: { nombre: { in: ["FASE2-2028-02", "FASE2-2028-03", "FASE2-2028-04"] } },
    });
  });
});

describe("A1 + M5: clase 7 (costos de producción) y redondeo en reportes", () => {
  beforeAll(async () => {
    await prisma.comprobante.deleteMany({ where: { periodoId } });
    // Aporte inicial: caja vs capital
    await crearContabilizado(periodoId, "2028-01-02", "FASE2 aporte", [
      asiento(cajaId, { debito: 1000000 }),
      asiento(capitalId, { credito: 1000000 }),
    ]);
    // Venta a crédito: caja vs ingresos
    await crearContabilizado(periodoId, "2028-01-05", "FASE2 venta", [
      asiento(cajaId, { debito: 200000 }),
      asiento(ingresosId, { credito: 200000 }),
    ]);
    // Costo de ventas (clase 6)
    await crearContabilizado(periodoId, "2028-01-08", "FASE2 costo ventas", [
      asiento(costoVentasId, { debito: 80000 }),
      asiento(cajaId, { credito: 80000 }),
    ]);
    // Materias primas consumidas (clase 7, costos de producción)
    await crearContabilizado(periodoId, "2028-01-12", "FASE2 materia prima", [
      asiento(costosProduccionId, { debito: 30000 }),
      asiento(cajaId, { credito: 30000 }),
    ]);
    // Gasto (clase 5)
    await crearContabilizado(periodoId, "2028-01-15", "FASE2 gasto", [
      asiento(gastosId, { debito: 20000 }),
      asiento(cajaId, { credito: 20000 }),
    ]);
  });

  it("estado de resultados incluye costos de producción (clase 7) en el resultado", async () => {
    const res = await request(app)
      .get(`/api/reportes/estado-resultados?periodoId=${periodoId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    expect(res.body.totalIngresos).toBe(200000);
    expect(res.body.totalCostos).toBe(80000);
    expect(res.body.totalCostosProduccion).toBe(30000);
    expect(res.body.totalGastos).toBe(20000);
    expect(res.body.resultado).toBe(70000);

    const grupo71 = res.body.costosProduccion.find((g: { grupo: string }) => g.grupo === "71");
    expect(grupo71).toBeTruthy();
    expect(grupo71.total).toBe(30000);
  });

  it("balance general cuadra con resultados (ecuacionOK) y descuenta los costos de producción", async () => {
    const res = await request(app)
      .get(`/api/reportes/balance-general?periodoId=${periodoId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    expect(res.body.totalActivo).toBe(1070000);
    expect(res.body.totalPasivo).toBe(0);
    expect(res.body.totalPatrimonio).toBe(1070000);
    expect(res.body.resultado).toBe(70000);
    expect(res.body.ecuacionOK).toBe(true);

    const resultados = res.body.patrimonio.find((g: { grupo: string }) => g.grupo === "99");
    expect(resultados).toBeTruthy();
    expect(resultados.total).toBe(70000);
  });
});

describe("A3: validaciones por defecto en comprobantes generados", () => {
  it("rechaza cuenta que requiere tercero (verificarCuentas por defecto)", async () => {
    const privada = await prisma.cuenta.create({
      data: { empresaId, codigo: "199902", nombre: "FASE2 requiere tercero", requiereTercero: true, permiteMovimiento: true, ...derivarPuc("199902") },
    });
    await expect(
      crearComprobanteDiario(prisma as unknown as PrismaClient, {
        empresaId,
        periodoId,
        fecha: new Date("2028-01-20"),
        concepto: "A3 requiere tercero",
        usuarioId: adminId,
        asientos: [
          { cuentaId: privada.id, debito: 0, credito: 50000 },
          { cuentaId: cajaId, debito: 50000, credito: 0 },
        ],
      }),
    ).rejects.toThrow(/requiere tercero/);
    await prisma.cuenta.deleteMany({ where: { codigo: "199902", empresaId } });
  });

  it("rechaza periodo cerrado (verificarPeriodoAbierto por defecto)", async () => {
    const cerrado = await crearPeriodo("FASE2-2028-07", "2028-07-01", "2028-07-31", "CERRADO");
    await expect(
      crearComprobanteDiario(prisma as unknown as PrismaClient, {
        empresaId,
        periodoId: cerrado.id,
        fecha: new Date("2028-07-10"),
        concepto: "A3 periodo cerrado",
        usuarioId: adminId,
        asientos: [
          { cuentaId: cajaId, debito: 1000, credito: 0 },
          { cuentaId: ingresosId, debito: 0, credito: 1000 },
        ],
      }),
    ).rejects.toThrow(/no está abierto/);
    await prisma.periodo.deleteMany({ where: { id: cerrado.id } });
  });
});

describe("M3: persistencia del estado VENCIDA en cartera", () => {
  async function crearCxc(documento: string, vencimiento: string) {
    const res = await request(app)
      .post("/api/cxc")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ terceroId, numeroDocumento: documento, fechaEmision: "2026-01-01", fechaVencimiento: vencimiento, valor: 100000 });
    expect(res.status).toBe(201);
    return res.body;
  }

  it("listar persiste VENCIDA (vencida) y conserva PENDIENTE (no vencida)", async () => {
    await crearCxc("FASE2-CC-001", "2026-01-02");
    await crearCxc("FASE2-CC-002", "2026-12-31");

    const lista = await request(app).get("/api/cxc").set("Authorization", `Bearer ${adminToken}`);
    expect(lista.status).toBe(200);
    const doc1 = lista.body.find((d: { numeroDocumento: string }) => d.numeroDocumento === "FASE2-CC-001");
    const doc2 = lista.body.find((d: { numeroDocumento: string }) => d.numeroDocumento === "FASE2-CC-002");
    expect(doc1).toBeTruthy();
    expect(doc2).toBeTruthy();

    expect(doc1.estado).toBe("VENCIDA");
    expect(doc2.estado).toBe("PENDIENTE");

    const enDb1 = await prisma.cuentaPorCobrar.findFirstOrThrow({ where: { numeroDocumento: "FASE2-CC-001" } });
    const enDb2 = await prisma.cuentaPorCobrar.findFirstOrThrow({ where: { numeroDocumento: "FASE2-CC-002" } });
    expect(enDb1.estado).toBe("VENCIDA");
    expect(enDb2.estado).toBe("PENDIENTE");
  });

  afterAll(async () => {
    await prisma.cuentaPorCobrar.deleteMany({ where: { numeroDocumento: { startsWith: PREFIX } } });
  });
});

describe("M6: balance de provisión recortado a la fecha del periodo", () => {
  it("ignora asientos posteriores a la fecha fin del periodo", async () => {
    const pA = await crearPeriodo("FASE2-2028-05", "2028-05-01", "2028-05-31", "ABIERTO");
    const pB = await crearPeriodo("FASE2-2028-06", "2028-06-01", "2028-06-30", "ABIERTO");

    // 2028-05: 1399 a favor de la provisión por 100.000
    await crearContabilizado(pA.id, "2028-05-31", "FASE2 M6 mayo", [
      asiento(cuentaProvisionId, { credito: 100000 }),
      asiento(cuentaGastoProvisionId, { debito: 100000 }),
    ]);
    // 2028-06: +50.000; debe quedar excluido al calcular la provisión de mayo
    await crearContabilizado(pB.id, "2028-06-15", "FASE2 M6 junio", [
      asiento(cuentaProvisionId, { credito: 50000 }),
      asiento(cuentaGastoProvisionId, { debito: 50000 }),
    ]);

    await prisma.parametroProvision.deleteMany({});
    await prisma.parametroProvision.createMany({
      data: [
        { diasDesde: 1, diasHasta: 30, porcentaje: 1 },
        { diasDesde: 31, diasHasta: 60, porcentaje: 5 },
        { diasDesde: 61, diasHasta: 90, porcentaje: 10 },
        { diasDesde: 91, diasHasta: null, porcentaje: 20 },
      ],
    });

    const res = await request(app)
      .post(`/api/cartera/provision/calcular/${pA.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.resumen.balanceProvision).toBe(100000);
    expect(res.body.resumen.requerido).toBe(0);

    await prisma.provisionCartera.deleteMany({ where: { periodoId: { in: [pA.id, pB.id] } } });
    await prisma.parametroProvision.deleteMany({});
    await prisma.comprobante.deleteMany({ where: { periodoId: { in: [pA.id, pB.id] } } });
    await prisma.periodo.deleteMany({ where: { id: { in: [pA.id, pB.id] } } });
  });
});

describe("A4: cierre anual valida la cuenta de utilidades", () => {
  it("rechaza una cuenta de utilidades sin movimiento o inactiva", async () => {
    const per = await crearPeriodo("FASE2-2027-01", "2027-01-01", "2027-01-31", "CERRADO");

    const sinMovimiento = await prisma.cuenta.create({
      data: { empresaId, codigo: "3615", nombre: "FASE2 A4 sin movimiento", permiteMovimiento: false, ...derivarPuc("3615") },
    });
    const inactiva = await prisma.cuenta.create({
      data: { empresaId, codigo: "3616", nombre: "FASE2 A4 inactiva", activa: false, ...derivarPuc("3616") },
    });

    const r1 = await request(app)
      .post("/api/cierre-anual/2027")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ cuentaUtilidadId: sinMovimiento.id });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toContain("patrimonio");

    const r2 = await request(app)
      .post("/api/cierre-anual/2027")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ cuentaUtilidadId: inactiva.id });
    expect(r2.status).toBe(400);
    expect(r2.body.error).toContain("patrimonio");

    // Sin cuentaUtilidadId usa el default 3605 (válido): debe pasar la validación
    // y solo fallar porque no hay saldos de resultado para el año.
    const r3 = await request(app).post("/api/cierre-anual/2027").set("Authorization", `Bearer ${adminToken}`).send({});
    expect(r3.status).toBe(400);
    expect(r3.body.error).toContain("No hay cuentas de resultado");

    await prisma.cuenta.deleteMany({ where: { id: { in: [sinMovimiento.id, inactiva.id] } } });
    await prisma.periodo.deleteMany({ where: { id: per.id } });
  });
});

describe("B1: catálogo PUC sincronizado con el oficial", () => {
  it("no incluye los códigos retirados y conserva la provisión 1399", async () => {
    const retiradas = await prisma.cuenta.count({
      where: { codigo: { in: ["63", "6305", "4155"] }, empresaId: null },
    });
    expect(retiradas).toBe(0);

    const provision = await prisma.cuenta.count({ where: { codigo: "1399", empresaId: null } });
    expect(provision).toBe(1);
  });
});

describe("M1: carrera crear comprobante vs cierre de periodo", () => {
  it("no queda ningún borrador escrito tras el cierre del periodo (validación dentro de la tx)", async () => {
    const p = await crearPeriodo("FASE2-M1-2028", "2028-04-01", "2028-04-30", "ABIERTO");

    const cuerpo = (n: number) => ({
      tipo: "DIARIO",
      fecha: "2028-04-15",
      periodoId: p.id,
      concepto: `FASE2 M1 carrera ${n}`,
      asientos: [asiento(cajaId, { debito: 1000 }), asiento(ingresosId, { credito: 1000 })],
    });
    const crear = (n: number) =>
      request(app).post("/api/comprobantes").set("Authorization", `Bearer ${adminToken}`).send(cuerpo(n));
    const cerrar = () =>
      request(app).patch(`/api/periodos/${p.id}`).set("Authorization", `Bearer ${adminToken}`).send({ estado: "CERRADO" });

    // 10 peticiones concurrentes: crear y cerrar disputan el mismo periodo.
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? crear(i) : cerrar()))
    );
    const creaciones = respuestas.filter((r) => r.status === 201).length;
    expect(creaciones + respuestas.filter((r) => r.status === 400 || r.status === 200).length).toBeGreaterThan(0);

    const periodoFinal = await prisma.periodo.findUniqueOrThrow({ where: { id: p.id } });
    const cierreAudit = await prisma.auditoria.findFirst({
      where: { accion: "CERRAR_PERIODO", entidadId: String(p.id) },
      orderBy: { id: "desc" },
    });

    if (periodoFinal.estado === "CERRADO") {
      // Ningún BORRADOR pudo escribirse DESPUÉS de que el cierre cometió.
      const despuesDelCierre = await prisma.comprobante.count({
        where: { periodoId: p.id, estado: "BORRADOR", ...(cierreAudit ? { createdAt: { gt: cierreAudit.fecha } } : {}) },
      });
      expect(despuesDelCierre).toBe(0);

      // Posteriormente, crear sobre el periodo cerrado responde 400.
      const posterior = await request(app)
        .post("/api/comprobantes")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(cuerpo(999));
      expect(posterior.status).toBe(400);
    } else {
      // Si ningún cierre ganó, forzarlo y verificar que el crear siguiente falla.
      const cierreForzado = await cerrar();
      expect(cierreForzado.status).toBe(200);
      const posterior = await request(app)
        .post("/api/comprobantes")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(cuerpo(999));
      expect(posterior.status).toBe(400);
    }

    await prisma.comprobante.deleteMany({ where: { periodoId: p.id } });
    await prisma.auditoria.deleteMany({ where: { entidadId: String(p.id), accion: { in: ["CERRAR_PERIODO", "REABRIR_PERIODO"] } } });
    await prisma.periodo.deleteMany({ where: { id: p.id } });
  });
});