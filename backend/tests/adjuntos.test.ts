import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import { empresaDePrueba } from "./helpers.js";
import bcrypt from "bcryptjs";

const app = createApp();
const emails = ["adminadj@test.local", "auxadj@test.local"];
const dirAdjuntos = path.join(os.tmpdir(), "contabilidad-test-adjuntos");

let adminToken = "";
let auxToken = "";
let adminId = "";
let auxId = "";
let periodoId = 0;
let comprobanteId = 0;
let adjuntoId = 0;
let adjuntoNombreArchivo = "";
let adjuntoEmpresaId = 0;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  const idsPrevios = (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
  await prisma.adjunto.deleteMany({});
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: idsPrevios } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });

  await prisma.usuario.create({ data: { nombre: "Admin Adjuntos", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  await prisma.usuario.create({ data: { nombre: "Aux Adjuntos", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminId = (await prisma.usuario.findUniqueOrThrow({ where: { email: emails[0] }, select: { id: true } })).id;
  auxId = (await prisma.usuario.findUniqueOrThrow({ where: { email: emails[1] }, select: { id: true } })).id;
  adminToken = await login(emails[0], "clave123");
  auxToken = await login(emails[1], "clave123");

  const cuentas = await prisma.cuenta.findMany({ where: { codigo: { in: ["110505", "4120"] } } });
  const cajaId = cuentas.find((c) => c.codigo === "110505")!.id;
  const ingresosId = cuentas.find((c) => c.codigo === "4120")!.id;

  const periodo = await prisma.periodo.create({
    data: { nombre: "2026-12", fechaInicio: new Date("2026-12-01"), fechaFin: new Date("2026-12-31") },
  });
  periodoId = periodo.id;

  const consecutivo = (await prisma.comprobante.count({ where: { tipo: "DIARIO" } })) + 1;
  const comprobante = await prisma.comprobante.create({
    data: {
      tipo: "DIARIO",
      fecha: new Date("2026-12-05"),
      periodoId,
      concepto: "Soporte adjuntos",
      estado: "CONTABILIZADO",
      consecutivo,
      totalDebito: 100000,
      totalCredito: 100000,
      usuarioCreoId: adminId,
      asientos: {
        create: [
          { cuentaId: cajaId, debito: 100000, credito: 0 },
          { cuentaId: ingresosId, debito: 0, credito: 100000 },
        ],
      },
    },
  });
  comprobanteId = comprobante.id;
});

afterAll(async () => {
  await prisma.adjunto.deleteMany({});
  await prisma.comprobante.deleteMany({});
  await prisma.periodo.deleteMany({});
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, auxId] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
  fs.rmSync(dirAdjuntos, { recursive: true, force: true });
});

describe("Adjuntos", () => {
  it("sube un adjunto a un comprobante", async () => {
    const res = await request(app)
      .post("/api/adjuntos")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("entidad", "COMPROBANTE")
      .field("entidadId", String(comprobanteId))
      .attach("archivo", Buffer.from("contenido-factura-123"), "factura.pdf");

    expect(res.status).toBe(201);
    expect(res.body.nombreOriginal).toBe("factura.pdf");
    expect(res.body.entidad).toBe("COMPROBANTE");
    expect(res.body.entidadId).toBe(String(comprobanteId));
    expect(res.body.hash).toMatch(/^[0-9a-f]{64}$/);
    adjuntoId = res.body.id;
    adjuntoNombreArchivo = res.body.nombreArchivo;
    expect(fs.existsSync(path.join(dirAdjuntos, res.body.nombreArchivo))).toBe(true);
  });

  it("sube un adjunto a la empresa (cliente)", async () => {
    const empresaId = await empresaDePrueba();
    const res = await request(app)
      .post("/api/adjuntos")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("entidad", "EMPRESA")
      .field("entidadId", empresaId)
      .attach("archivo", Buffer.from("soporte-cliente"), "certificado.pdf");
    expect(res.status).toBe(201);
    expect(res.body.entidad).toBe("EMPRESA");
    adjuntoEmpresaId = res.body.id;
  });

  it("rechaza una entidad inexistente", async () => {
    const res = await request(app)
      .post("/api/adjuntos")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("entidad", "COMPROBANTE")
      .field("entidadId", "999999")
      .attach("archivo", Buffer.from("x"), "x.pdf");
    expect(res.status).toBe(404);
  });

  it("lista los adjuntos de un comprobante", async () => {
    const res = await request(app)
      .get(`/api/adjuntos?entidad=COMPROBANTE&entidadId=${comprobanteId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].nombreOriginal).toBe("factura.pdf");
    expect(res.body[0].usuario).toBe("Admin Adjuntos");
  });

  it("descarga el archivo original", async () => {
    const res = await request(app).get(`/api/adjuntos/${adjuntoId}/descargar`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("factura.pdf");
    expect(Buffer.from(res.body).toString("utf8")).toBe("contenido-factura-123");
  });

  it("un AUXILIAR no puede eliminar adjuntos (403)", async () => {
    const res = await request(app).delete(`/api/adjuntos/${adjuntoId}`).set("Authorization", `Bearer ${auxToken}`);
    expect(res.status).toBe(403);
  });

  it("ADMIN elimina el adjunto y su archivo del disco", async () => {
    const res = await request(app).delete(`/api/adjuntos/${adjuntoId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(dirAdjuntos, adjuntoNombreArchivo))).toBe(false);
  });

  it("exige autenticación", async () => {
    const res = await request(app).get("/api/adjuntos");
    expect(res.status).toBe(401);
  });

  it("registra la subida en auditoría", async () => {
    const detalle = await prisma.auditoria.findFirst({ where: { accion: "SUBIR_ADJUNTO", entidad: "EMPRESA", entidadId: (await empresaDePrueba()) } });
    expect(detalle).not.toBeNull();
    void adjuntoEmpresaId;
  });
});

