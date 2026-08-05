import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const emails = ["procesos-admin@test.local", "procesos-cont@test.local", "procesos-aux@test.local"];
const suf = Date.now();

let adminToken = "";
let contadorToken = "";
let auxiliarToken = "";

let procesoId = "";

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

function auth(token: string) {
  return (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
}

function getProceso(id: string, token: string) {
  return request(app).get(`/api/procesos/${id}`).use(auth(token));
}

beforeAll(async () => {
  await prisma.procesoContable.deleteMany({});
  const idsPrevios = (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: idsPrevios } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `PROC-${suf}` } } });

  const admin = await prisma.usuario.create({ data: { nombre: "Procesos Admin", email: emails[0], passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  const contador = await prisma.usuario.create({ data: { nombre: "Procesos Contador", email: emails[1], passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" } });
  const auxiliar = await prisma.usuario.create({ data: { nombre: "Procesos Auxiliar", email: emails[2], passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminToken = await login(emails[0], "clave123");
  contadorToken = await login(emails[1], "clave123");
  auxiliarToken = await login(emails[2], "clave123");

  await prisma.periodo.create({
    data: { nombre: `PROC-${suf}-2026-12`, fechaInicio: new Date("2026-12-01"), fechaFin: new Date("2026-12-31") },
  });
});

afterAll(async () => {
  await prisma.procesoContable.deleteMany({});
  await prisma.periodo.deleteMany({ where: { nombre: { startsWith: `PROC-${suf}` } } });
  const ids = (await prisma.usuario.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("Procesos contables: validaciones", () => {
  it("no autenticado recibe 401", async () => {
    const res = await request(app).get("/api/procesos");
    expect(res.status).toBe(401);
  });

  it("rechaza año inválido (400)", async () => {
    const res = await request(app).post("/api/procesos").use(auth(adminToken)).send({ anio: 1500 });
    expect(res.status).toBe(400);
  });
});

describe("Procesos contables: CRUD y plantilla", () => {
  it("crea un proceso con la plantilla de 7 actividades", async () => {
    const res = await request(app).post("/api/procesos").use(auth(adminToken)).send({ anio: 2026 });
    expect(res.status).toBe(201);
    procesoId = res.body.id;

    expect(res.body.estado).toBe("SIN_INICIAR");
    expect(res.body.actividades).toHaveLength(7);
    expect(res.body.actividades.map((a: { orden: number }) => a.orden)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(res.body.actividades.every((a: { estado: boolean }) => a.estado === false)).toBe(true);
  });

  it("no permite dos procesos para el mismo año (409)", async () => {
    const res = await request(app).post("/api/procesos").use(auth(adminToken)).send({ anio: 2026 });
    expect(res.status).toBe(409);
  });

  it("obtiene el detalle con actividades y notas vacías", async () => {
    const res = await getProceso(procesoId, contadorToken);
    expect(res.status).toBe(200);
    expect(res.body.anio).toBe(2026);
    expect(res.body.avance).toEqual({ total: 7, completadas: 0, porcentaje: 0 });
    expect(res.body.notas).toEqual([]);
    const tipos = res.body.actividades.map((a: { tipo: string }) => a.tipo);
    expect(tipos).toContain("CIERRE_ANIO");
    expect(tipos).toContain("NOMINA");
    expect(tipos).toContain("PROVISION_CARTERA");
  });

  it("AUXILIAR puede leer pero no crear (403)", async () => {
    const lectura = await getProceso(procesoId, auxiliarToken);
    expect(lectura.status).toBe(200);
    const creacion = await request(app).post("/api/procesos").use(auth(auxiliarToken)).send({ anio: 2027 });
    expect(creacion.status).toBe(403);
  });

  it("proceso inexistente responde 404", async () => {
    const res = await getProceso("no-existe", adminToken);
    expect(res.status).toBe(404);
  });
});

describe("Procesos contables: actividades y notas", () => {
  it("marca una actividad como completada con fecha real", async () => {
    const detalle = await getProceso(procesoId, adminToken);
    const primera = detalle.body.actividades[0];

    const res = await request(app)
      .patch(`/api/procesos/${procesoId}/actividades/${primera.id}`)
      .use(auth(contadorToken))
      .send({ estado: true });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe(true);
    expect(res.body.fechaReal).toBe(new Date().toISOString().slice(0, 10));

    const despues = await getProceso(procesoId, adminToken);
    expect(despues.body.avance.completadas).toBe(1);
    expect(despues.body.avance.porcentaje).toBe(Math.round((1 / 7) * 100));
  });

  it("fija y limpia la fecha esperada", async () => {
    const detalle = await getProceso(procesoId, adminToken);
    const actividad = detalle.body.actividades[1];

    const conFecha = await request(app)
      .patch(`/api/procesos/${procesoId}/actividades/${actividad.id}`)
      .use(auth(adminToken))
      .send({ fechaEsperada: "2026-12-15" });
    expect(conFecha.status).toBe(200);
    expect(conFecha.body.fechaEsperada).toBe("2026-12-15");

    const sinFecha = await request(app)
      .patch(`/api/procesos/${procesoId}/actividades/${actividad.id}`)
      .use(auth(adminToken))
      .send({ fechaEsperada: null });
    expect(sinFecha.status).toBe(200);
    expect(sinFecha.body.fechaEsperada).toBe(null);
  });

  it("AUXILIAR no puede marcar actividades (403)", async () => {
    const detalle = await getProceso(procesoId, adminToken);
    const actividad = detalle.body.actividades[2];
    const res = await request(app)
      .patch(`/api/procesos/${procesoId}/actividades/${actividad.id}`)
      .use(auth(auxiliarToken))
      .send({ estado: true });
    expect(res.status).toBe(403);
  });

  it("agrega una nota de seguimiento", async () => {
    const res = await request(app)
      .post(`/api/procesos/${procesoId}/notas`)
      .use(auth(contadorToken))
      .send({ texto: "Pendiente conciliación de bancos" });
    expect(res.status).toBe(201);
    expect(res.body.usuario).toBe("Procesos Contador");

    const detalle = await getProceso(procesoId, adminToken);
    expect(detalle.body.notas).toHaveLength(1);
    expect(detalle.body.notas[0].texto).toBe("Pendiente conciliación de bancos");
  });

  it("rechaza nota vacía (400)", async () => {
    const res = await request(app).post(`/api/procesos/${procesoId}/notas`).use(auth(adminToken)).send({ texto: "" });
    expect(res.status).toBe(400);
  });

  it("AUXILIAR no puede agregar notas (403)", async () => {
    const res = await request(app).post(`/api/procesos/${procesoId}/notas`).use(auth(auxiliarToken)).send({ texto: "intento" });
    expect(res.status).toBe(403);
  });
});

describe("Procesos contables: estado y cartera", () => {
  it("cambia el estado del proceso (ADMIN)", async () => {
    const res = await request(app).patch(`/api/procesos/${procesoId}`).use(auth(adminToken)).send({ estado: "AL_DIA" });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("AL_DIA");
  });

  it("rechaza un estado inválido (400)", async () => {
    const res = await request(app).patch(`/api/procesos/${procesoId}`).use(auth(adminToken)).send({ estado: "INEXISTENTE" });
    expect(res.status).toBe(400);
  });

  it("AUXILIAR no puede cambiar el estado (403)", async () => {
    const res = await request(app).patch(`/api/procesos/${procesoId}`).use(auth(auxiliarToken)).send({ estado: "CERRADO" });
    expect(res.status).toBe(403);
  });

  it("cartera devuelve la empresa con su proceso y avance", async () => {
    const res = await request(app).get("/api/procesos/cartera").use(auth(adminToken));
    expect(res.status).toBe(200);
    const fila = res.body.find((f: { empresa: { id: string } }) => f.empresa.id === res.body[0].empresa.id);
    expect(fila).toBeTruthy();
    expect(fila.proceso.anio).toBe(2026);
    expect(fila.proceso.avance.total).toBe(7);
  });

  it("elimina el proceso (ADMIN) y desaparece del detalle", async () => {
    const res = await request(app).delete(`/api/procesos/${procesoId}`).use(auth(adminToken));
    expect(res.status).toBe(200);
    const detalle = await getProceso(procesoId, adminToken);
    expect(detalle.status).toBe(404);
  });
});

describe("Integración: marcado automático por operaciones contables", () => {
  it("cerrar un periodo marca CIERRE_PERIODO y COMPROBANTES", async () => {
    const creado = await request(app).post("/api/procesos").use(auth(adminToken)).send({ anio: 2026 });
    expect(creado.status).toBe(201);
    procesoId = creado.body.id;

    const periodo = await prisma.periodo.findFirstOrThrow({ where: { nombre: `PROC-${suf}-2026-12` } });
    const cierre = await request(app).patch(`/api/periodos/${periodo.id}`).use(auth(adminToken)).send({ estado: "CERRADO" });
    expect(cierre.status).toBe(200);

    const detalle = await getProceso(procesoId, adminToken);
    const porTipo = Object.fromEntries(detalle.body.actividades.map((a: { tipo: string; estado: boolean }) => [a.tipo, a.estado]));
    expect(porTipo.CIERRE_PERIODO).toBe(true);
    expect(porTipo.COMPROBANTES).toBe(true);
    expect(porTipo.NOMINA).toBe(false);
  });

  it("cerrar un periodo de un año sin proceso no lo crea ni falla", async () => {
    const periodo = await prisma.periodo.create({
      data: { nombre: `PROC-${suf}-2023-12`, fechaInicio: new Date("2023-12-01"), fechaFin: new Date("2023-12-31") },
    });
    const cierre = await request(app).patch(`/api/periodos/${periodo.id}`).use(auth(adminToken)).send({ estado: "CERRADO" });
    expect(cierre.status).toBe(200);

    const procesos2023 = await prisma.procesoContable.count({ where: { anio: 2023 } });
    expect(procesos2023).toBe(0);
    await prisma.periodo.delete({ where: { id: periodo.id } });
  });
});
