import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["aud-admin@test.local", "aud-aux@test.local", "aud-creado@test.local"];
const suf = Date.now();
const periodoNombre = `AUD-${suf}`;

let adminId = "";
let auxId = "";
let adminToken = "";
let auxToken = "";

let cajaId = 0;
let ingresosId = 0;
let cuentaActivoId = 0;
let cuentaAcumId = 0;
let cuentaGastoId = 0;

let periodoId = 0;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

async function buscarRegistro(entidad: string, entidadId: string | number, accion?: string) {
  const res = await request(app)
    .get(`/api/auditoria?entidad=${entidad}&limite=500`)
    .set("Authorization", `Bearer ${adminToken}`);
  const idStr = String(entidadId);
  return res.body.find(
    (r: { entidadId: string; accion: string }) => r.entidadId === idStr && (!accion || r.accion === accion)
  );
}

async function crearComprobante(concepto: string) {
  return request(app)
    .post("/api/comprobantes")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      tipo: "DIARIO",
      fecha: "2026-08-10",
      periodoId,
      concepto,
      asientos: [
        { cuentaId: cajaId, debito: 500000 },
        { cuentaId: ingresosId, credito: 500000 },
      ],
    });
}

async function crearActivo(nombre: string) {
  return request(app)
    .post("/api/activos-fijos")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      cuentaId: cuentaActivoId,
      cuentaDepreciacionId: cuentaAcumId,
      cuentaGastoId,
      nombre,
      fechaAdquisicion: "2026-01-10",
      valor: 1200000,
      vidaUtilMeses: 12,
      valorResidual: 0,
    });
}

beforeAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, auxId] } } });
  await prisma.depreciacion.deleteMany({});
  await prisma.activoFijo.deleteMany({});
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: periodoNombre } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Depreciación" } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Baja" } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: periodoNombre } } });
  await prisma.cuenta.deleteMany({ where: { codigo: "9901" } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  const admin = await prisma.usuario.create({ data: { nombre: "Aud Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  const aux = await prisma.usuario.create({ data: { nombre: "Aud Aux", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminId = admin.id;
  auxId = aux.id;
  adminToken = await login(emails[0], "clave123");
  auxToken = await login(emails[1], "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "4120", "152005", "159625", "516020"] } } });
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));
  cajaId = porCodigo.get("110505")!;
  ingresosId = porCodigo.get("4120")!;
  cuentaActivoId = porCodigo.get("152005")!;
  cuentaAcumId = porCodigo.get("159625")!;
  cuentaGastoId = porCodigo.get("516020")!;

  const periodo = await prisma.periodo.create({
    data: { nombre: periodoNombre, fechaInicio: new Date("2026-08-01"), fechaFin: new Date("2026-08-31") },
  });
  periodoId = periodo.id;
});

afterAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, auxId] } } });
  await prisma.depreciacion.deleteMany({});
  await prisma.activoFijo.deleteMany({});
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: periodoNombre } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Depreciación" } } });
  await prisma.comprobante.deleteMany({ where: { concepto: { startsWith: "Baja" } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: periodoNombre } } });
  await prisma.cuenta.deleteMany({ where: { codigo: "9901" } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Bitácora de auditoría: comprobantes", () => {
  it("contabilizar registra CONTABILIZAR con el usuario ejecutor", async () => {
    const creado = await crearComprobante(`${periodoNombre}-c1`);
    expect(creado.status).toBe(201);

    const res = await request(app)
      .post(`/api/comprobantes/${creado.body.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const reg = await buscarRegistro("Comprobante", creado.body.id, "CONTABILIZAR");
    expect(reg).toBeTruthy();
    expect(reg.usuario).toBe("Aud Admin");
    expect(reg.usuarioId).toBe(adminId);
  });

  it("anular registra ANULAR", async () => {
    const creado = await crearComprobante(`${periodoNombre}-c2`);
    await request(app)
      .post(`/api/comprobantes/${creado.body.id}/contabilizar`)
      .set("Authorization", `Bearer ${adminToken}`);
    const res = await request(app)
      .post(`/api/comprobantes/${creado.body.id}/anular`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const reg = await buscarRegistro("Comprobante", creado.body.id, "ANULAR");
    expect(reg).toBeTruthy();
  });

  it("eliminar un borrador registra ELIMINAR_COMPROBANTE", async () => {
    const creado = await crearComprobante(`${periodoNombre}-c3`);
    const res = await request(app)
      .delete(`/api/comprobantes/${creado.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const reg = await buscarRegistro("Comprobante", creado.body.id, "ELIMINAR_COMPROBANTE");
    expect(reg).toBeTruthy();
  });
});

describe("Bitácora de auditoría: periodos", () => {
  it("cerrar y reabrir un periodo quedan registrados", async () => {
    const cerrar = await request(app)
      .patch(`/api/periodos/${periodoId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ estado: "CERRADO" });
    expect(cerrar.status).toBe(200);

    const reabrir = await request(app)
      .patch(`/api/periodos/${periodoId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ estado: "ABIERTO" });
    expect(reabrir.status).toBe(200);

    const cerrarReg = await buscarRegistro("Periodo", periodoId, "CERRAR_PERIODO");
    const reabrirReg = await buscarRegistro("Periodo", periodoId, "REABRIR_PERIODO");
    expect(cerrarReg).toBeTruthy();
    expect(reabrirReg).toBeTruthy();
  });
});

describe("Bitácora de auditoría: usuarios y cuentas", () => {
  it("crear usuario registra CREAR_USUARIO", async () => {
    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Aud Creado", email: emails[2], password: "clave123", rol: "CONTADOR" });
    expect(res.status).toBe(201);

    const reg = await buscarRegistro("Usuario", res.body.id, "CREAR_USUARIO");
    expect(reg).toBeTruthy();
    expect(reg.detalle.email).toBe(emails[2]);
    expect(reg.detalle.rol).toBe("CONTADOR");
  });

  it("crear y editar una cuenta quedan registrados", async () => {
    const creada = await request(app)
      .post("/api/cuentas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codigo: "9901", nombre: "Cuenta auditoría" });
    expect(creada.status).toBe(201);

    const editada = await request(app)
      .patch(`/api/cuentas/${creada.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "Cuenta auditoría renombrada", activa: true });
    expect(editada.status).toBe(200);

    const crearReg = await buscarRegistro("Cuenta", creada.body.id, "CREAR_CUENTA");
    const editarReg = await buscarRegistro("Cuenta", creada.body.id, "EDITAR_CUENTA");
    expect(crearReg).toBeTruthy();
    expect(crearReg.detalle.codigo).toBe("9901");
    expect(editarReg).toBeTruthy();
    expect(editarReg.detalle.cambios.nombre).toBe("Cuenta auditoría renombrada");
  });
});

describe("Bitácora de auditoría: activos fijos", () => {
  it("crear un activo registra CREAR_ACTIVO", async () => {
    const creado = await crearActivo(`${periodoNombre}-activo`);
    expect(creado.status).toBe(201);

    const reg = await buscarRegistro("ActivoFijo", creado.body.id, "CREAR_ACTIVO");
    expect(reg).toBeTruthy();
    expect(reg.detalle.valor).toBe(1200000);
  });

  it("depreciar un periodo registra DEPRECIAR_ACTIVOS", async () => {
    const activo = await crearActivo(`${periodoNombre}-dep`);
    expect(activo.status).toBe(201);
    await prisma.activoFijo.updateMany({ where: { id: { not: activo.body.id } }, data: { estado: "DADO_DE_BAJA" } });

    const res = await request(app)
      .post(`/api/activos-fijos/depreciar/${periodoId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);

    const reg = await buscarRegistro("Periodo", periodoId, "DEPRECIAR_ACTIVOS");
    expect(reg).toBeTruthy();
    expect(reg.detalle.procesados).toBe(1);
  });

  it("dar de baja un activo registra BAJA_ACTIVO", async () => {
    const creado = await crearActivo(`${periodoNombre}-baja`);
    expect(creado.status).toBe(201);

    const res = await request(app)
      .post(`/api/activos-fijos/${creado.body.id}/baja`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ periodoId, fecha: "2026-08-15", concepto: `Baja ${periodoNombre}` });
    expect(res.status).toBe(201);

    const reg = await buscarRegistro("ActivoFijo", creado.body.id, "BAJA_ACTIVO");
    expect(reg).toBeTruthy();
    expect(reg.detalle.valorLibros).toBe(1200000);
  });
});

describe("Bitácora de auditoría: consultas y roles", () => {
  it("filtra por entidad", async () => {
    const res = await request(app)
      .get("/api/auditoria?entidad=Periodo&limite=500")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body.every((r: { entidad: string }) => r.entidad === "Periodo")).toBe(true);
  });

  it("soporta filtros por usuario y rango de fechas", async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 1);
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + 1);
    const res = await request(app)
      .get(`/api/auditoria?usuarioId=${adminId}&desde=${desde.toISOString()}&hasta=${hasta.toISOString()}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("AUXILIAR no puede consultar la bitácora (403)", async () => {
    const res = await request(app).get("/api/auditoria").set("Authorization", `Bearer ${auxToken}`);
    expect(res.status).toBe(403);
  });

  it("no autenticado recibe 401", async () => {
    const res = await request(app).get("/api/auditoria");
    expect(res.status).toBe(401);
  });
});
