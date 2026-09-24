import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";
import { EstadoNomina } from "@prisma/client";

const app = createApp();

const email = "emp-admin@test.local";
const suf = Date.now();
let adminToken = "";
let terceroId = "";
let empleadoId = "";
let periodoId = 0;

async function login(mail: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email: mail, password });
  return res.body.token;
}

async function limpiar(): Promise<void> {
  await prisma.nomina.deleteMany({ where: { periodoId } });
  await prisma.periodo.deleteMany({ where: { nombre: `EMP-${suf}` } });
  await prisma.empleado.deleteMany({});
  await prisma.tercero.deleteMany({ where: { documento: { startsWith: `EMP-${suf}` } } });
}

async function crearEmpleado(cargo = "Ayudante", salario = 1500000, inicio = "2026-01-15"): Promise<string> {
  const t = await prisma.tercero.create({ data: { tipo: "AMBOS", tipoDocumento: "CC", documento: `EMP-${suf}-${cargo}`, nombreRazonSocial: cargo } });
  const e = await prisma.empleado.create({ data: { terceroId: t.id, cargo, salarioBase: salario, fechaIngreso: new Date(inicio) } });
  return e.id;
}

beforeAll(async () => {
  const previos = await prisma.usuario.findMany({ where: { email }, select: { id: true } });
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: previos.map((u) => u.id) } } });
  await prisma.usuario.deleteMany({ where: { email } });
  await limpiar();

  const admin = await prisma.usuario.create({ data: { nombre: "Emp Admin", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  adminToken = await login(email, "clave123");

  const tercero = await prisma.tercero.create({ data: { tipo: "AMBOS", tipoDocumento: "CC", documento: `EMP-${suf}-A`, nombreRazonSocial: "Empleado A" } });
  terceroId = tercero.id;
  const empleado = await prisma.empleado.create({ data: { terceroId: tercero.id, cargo: "Auxiliar", salarioBase: 1750905, fechaIngreso: new Date("2025-01-15"), arlEmpleador: 0.522 } });
  empleadoId = empleado.id;

  const periodo = await prisma.periodo.create({ data: { nombre: `EMP-${suf}`, fechaInicio: new Date("2026-08-01"), fechaFin: new Date("2026-08-31") } });
  periodoId = periodo.id;
});

afterAll(async () => {
  await limpiar();
  const admin = await prisma.usuario.findFirst({ where: { email }, select: { id: true } });
  if (admin) await prisma.auditoria.deleteMany({ where: { usuarioId: admin.id } });
  await prisma.usuario.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("Empleados: retirar", () => {
  it("retira un empleado activo", async () => {
    const res = await request(app).post(`/api/empleados/${empleadoId}/retiro`).set("Authorization", `Bearer ${adminToken}`).send({ fechaRetiro: "2026-07-31" });
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
    expect(res.body.fechaRetiro).toBe("2026-07-31");
  });

  it("no permite retirar dos veces al mismo empleado (400)", async () => {
    const res = await request(app).post(`/api/empleados/${empleadoId}/retiro`).set("Authorization", `Bearer ${adminToken}`).send({ fechaRetiro: "2026-08-15" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ya está retirado");
  });

  it("404 si el empleado no existe", async () => {
    const res = await request(app).post("/api/empleados/00000000-0000-0000-0000-000000000000/retiro").set("Authorization", `Bearer ${adminToken}`).send({ fechaRetiro: "2026-07-31" });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("no encontrado");
  });

  it("400 con fecha de retiro inválida", async () => {
    const id = await crearEmpleado("FechaInvalida");
    try {
      const res = await request(app).post(`/api/empleados/${id}/retiro`).set("Authorization", `Bearer ${adminToken}`).send({ fechaRetiro: "no-es-fecha" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Fecha de retiro inválida");
    } finally {
      await prisma.empleado.deleteMany({ where: { id } });
      await prisma.tercero.deleteMany({ where: { documento: `EMP-${suf}-FechaInvalida` } });
    }
  });

  it("400 sin cuerpo (Zod)", async () => {
    const id = await crearEmpleado("SinCuerpo");
    try {
      const res = await request(app).post(`/api/empleados/${id}/retiro`).set("Authorization", `Bearer ${adminToken}`).send({});
      expect(res.status).toBe(400);
    } finally {
      await prisma.empleado.deleteMany({ where: { id } });
      await prisma.tercero.deleteMany({ where: { documento: `EMP-${suf}-SinCuerpo` } });
    }
  });
});

describe("Empleados: listarLiquidaciones", () => {
  it("404 si el empleado no existe", async () => {
    const res = await request(app).get("/api/empleados/00000000-0000-0000-0000-000000000000/liquidaciones").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("no encontrado");
  });

  it("devuelve lista vacía si el empleado no tiene nóminas", async () => {
    const res = await request(app).get(`/api/empleados/${empleadoId}/liquidaciones`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("lista las nóminas del empleado con el periodo", async () => {
    const nuevoId = await crearEmpleado("ConNomina");
    try {
      const linea = await prisma.nomina.create({
        data: {
          empleadoId: nuevoId,
          periodoId,
          sueldo: 1500000,
          totalDevengado: 1500000,
          totalDeducciones: 0,
          netoPagar: 1500000,
          estado: EstadoNomina.CONTABILIZADO,
        },
      });
      const res = await request(app).get(`/api/empleados/${nuevoId}/liquidaciones`).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(linea.id);
      expect(res.body[0].periodoId).toBe(periodoId);
      expect(res.body[0].periodo).toBe(`EMP-${suf}`);
      expect(res.body[0].netoPagar).toBe(1500000);
      expect(res.body[0].estado).toBe(EstadoNomina.CONTABILIZADO);
    } finally {
      await prisma.nomina.deleteMany({ where: { empleadoId: nuevoId } });
      await prisma.empleado.deleteMany({ where: { id: nuevoId } });
      await prisma.tercero.deleteMany({ where: { documento: `EMP-${suf}-ConNomina` } });
    }
  });
});