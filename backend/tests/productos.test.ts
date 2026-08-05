import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import bcrypt from "bcryptjs";

const app = createApp();

const email = "admin8@test.local";
let token = "";

async function login(): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: "clave123" });
  return res.body.token;
}

beforeAll(async () => {
  await prisma.inventarioMovimiento.deleteMany({});
  await prisma.producto.deleteMany({});
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });

  await prisma.usuario.create({ data: { nombre: "Admin 8", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  token = await login();
});

afterAll(async () => {
  await prisma.inventarioMovimiento.deleteMany({});
  await prisma.producto.deleteMany({});
  await prisma.usuario.deleteMany({ where: { email: { in: [email] } } });
  await prisma.$disconnect();
});

describe("Productos", () => {
  it("crea un producto", async () => {
    const res = await request(app)
      .post("/api/productos")
      .set("Authorization", `Bearer ${token}`)
      .send({ codigo: "P-001", nombre: "Lapiz", categoria: "Papeleria", unidad: "und" });
    expect(res.status).toBe(201);
    expect(res.body.cantidadActual).toBe(0);
  });

  it("rechaza código duplicado (409)", async () => {
    const res = await request(app)
      .post("/api/productos")
      .set("Authorization", `Bearer ${token}`)
      .send({ codigo: "P-001", nombre: "Otro lapiz" });
    expect(res.status).toBe(409);
  });

  it("actualiza datos del producto", async () => {
    const p = await request(app).post("/api/productos").set("Authorization", `Bearer ${token}`).send({ codigo: "P-002", nombre: "Cuaderno" });
    const res = await request(app).patch(`/api/productos/${p.body.id}`).set("Authorization", `Bearer ${token}`).send({ nombre: "Cuaderno 100 hojas" });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe("Cuaderno 100 hojas");
  });
});

describe("Inventario", () => {
  let productoId = 0;

  beforeAll(async () => {
    const p = await prisma.producto.create({ data: { codigo: "KARDEX", nombre: "Kardex" } });
    productoId = p.id;
  });

  it("entrada inicial fija cantidad y costo promedio", async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/movimientos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tipo: "ENTRADA", cantidad: 10, costoUnitario: 1000, fecha: "2026-12-01" });
    expect(res.status).toBe(201);
    expect(res.body.actualizado.cantidadActual).toBe(10);
    expect(res.body.actualizado.costoPromedio).toBe(1000);
  });

  it("segunda entrada recalcula el costo promedio ponderado", async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/movimientos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tipo: "ENTRADA", cantidad: 10, costoUnitario: 1500, fecha: "2026-12-05" });
    expect(res.body.actualizado.cantidadActual).toBe(20);
    expect(res.body.actualizado.costoPromedio).toBe(1250);
  });

  it("salida usa el costo promedio y reduce el stock", async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/movimientos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tipo: "SALIDA", cantidad: 5, costoUnitario: 0, fecha: "2026-12-10" });
    expect(res.body.actualizado.cantidadActual).toBe(15);
    expect(res.body.actualizado.costoPromedio).toBe(1250);
    expect(res.body.movimiento.costoUnitario).toBe(1250);
  });

  it("rechaza salida mayor que el stock (400)", async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/movimientos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tipo: "SALIDA", cantidad: 999, costoUnitario: 0, fecha: "2026-12-11" });
    expect(res.status).toBe(400);
  });

  it("lista el kardex del producto", async () => {
    const res = await request(app).get(`/api/productos/${productoId}/movimientos`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.movimientos.length).toBe(3);
  });

  it("no permite eliminar un producto con movimientos, lo desactiva", async () => {
    const res = await request(app).delete(`/api/productos/${productoId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.desactivado).toBe(true);
    const despues = await prisma.producto.findUnique({ where: { id: productoId } });
    expect(despues?.activo).toBe(false);
  });

  it("elimina físicamente un producto sin movimientos", async () => {
    const p = await prisma.producto.create({ data: { codigo: "TEMPORAL", nombre: "Temporal" } });
    const res = await request(app).delete(`/api/productos/${p.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.desactivado).toBe(false);
    expect(await prisma.producto.findUnique({ where: { id: p.id } })).toBeNull();
  });

  it("exige autenticación (401)", async () => {
    const res = await request(app).get("/api/productos");
    expect(res.status).toBe(401);
  });
});
