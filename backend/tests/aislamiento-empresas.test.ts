import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { empresaDePrueba } from "./helpers.js";
import bcrypt from "bcryptjs";

const app = createApp();

type Metodo = "get" | "post" | "patch" | "put" | "delete";
interface Ruta {
  metodo: Metodo;
  ruta: string;
}

// Todas las rutas protegidas por `requireEmpresa` (registradas en app.ts y sus
// routers). Se consultan contra la empresa B con un usuario SIN vínculo:
// deben responder 403 sin excepción.
const RUTAS: Ruta[] = [
  // usuarios
  { metodo: "get", ruta: "/api/usuarios" },
  { metodo: "get", ruta: "/api/usuarios/disponibles" },
  { metodo: "post", ruta: "/api/usuarios" },
  { metodo: "post", ruta: "/api/usuarios/b/vincular" },
  { metodo: "patch", ruta: "/api/usuarios/b/rol" },
  { metodo: "delete", ruta: "/api/usuarios/b" },
  // empresas (solo la ruta de paquete de informes usa requireEmpresa)
  { metodo: "post", ruta: "/api/empresas/b/informes/paquete" },
  // cuentas
  { metodo: "get", ruta: "/api/cuentas" },
  { metodo: "post", ruta: "/api/cuentas" },
  { metodo: "patch", ruta: "/api/cuentas/1" },
  { metodo: "delete", ruta: "/api/cuentas/1" },
  // terceros
  { metodo: "get", ruta: "/api/terceros" },
  { metodo: "post", ruta: "/api/terceros" },
  { metodo: "patch", ruta: "/api/terceros/1" },
  { metodo: "delete", ruta: "/api/terceros/1" },
  // periodos
  { metodo: "get", ruta: "/api/periodos" },
  { metodo: "post", ruta: "/api/periodos" },
  { metodo: "patch", ruta: "/api/periodos/1" },
  { metodo: "delete", ruta: "/api/periodos/1" },
  // comprobantes
  { metodo: "get", ruta: "/api/comprobantes" },
  { metodo: "get", ruta: "/api/comprobantes/1" },
  { metodo: "post", ruta: "/api/comprobantes" },
  { metodo: "patch", ruta: "/api/comprobantes/1" },
  { metodo: "post", ruta: "/api/comprobantes/1/contabilizar" },
  { metodo: "post", ruta: "/api/comprobantes/1/anular" },
  { metodo: "delete", ruta: "/api/comprobantes/1" },
  // reportes (JSON, PDF y exportaciones)
  { metodo: "get", ruta: "/api/reportes/libro-diario" },
  { metodo: "get", ruta: "/api/reportes/libro-mayor" },
  { metodo: "get", ruta: "/api/reportes/balance-comprobacion" },
  { metodo: "get", ruta: "/api/reportes/balance-general" },
  { metodo: "get", ruta: "/api/reportes/estado-resultados" },
  { metodo: "get", ruta: "/api/reportes/indicadores/1" },
  { metodo: "get", ruta: "/api/reportes/indicadores/comparativo" },
  { metodo: "get", ruta: "/api/reportes/libro-diario.pdf" },
  { metodo: "get", ruta: "/api/reportes/libro-mayor.pdf" },
  { metodo: "get", ruta: "/api/reportes/libro-inventarios.pdf" },
  { metodo: "get", ruta: "/api/reportes/balance-general.pdf" },
  { metodo: "get", ruta: "/api/reportes/estado-resultados.pdf" },
  { metodo: "get", ruta: "/api/reportes/indicadores/1.pdf" },
  { metodo: "get", ruta: "/api/reportes/indicadores/1.csv" },
  { metodo: "get", ruta: "/api/reportes/indicadores/1.xlsx" },
  { metodo: "get", ruta: "/api/reportes/libro-diario.csv" },
  { metodo: "get", ruta: "/api/reportes/libro-mayor.csv" },
  { metodo: "get", ruta: "/api/reportes/balance-comprobacion.csv" },
  { metodo: "get", ruta: "/api/reportes/balance-general.csv" },
  { metodo: "get", ruta: "/api/reportes/estado-resultados.csv" },
  // cartera: cuentas por cobrar
  { metodo: "get", ruta: "/api/cxc" },
  { metodo: "post", ruta: "/api/cxc" },
  { metodo: "get", ruta: "/api/cxc/1" },
  { metodo: "patch", ruta: "/api/cxc/1" },
  { metodo: "delete", ruta: "/api/cxc/1" },
  { metodo: "post", ruta: "/api/cxc/1/recibos" },
  // cartera: cuentas por pagar
  { metodo: "get", ruta: "/api/cxp" },
  { metodo: "post", ruta: "/api/cxp" },
  { metodo: "get", ruta: "/api/cxp/1" },
  { metodo: "patch", ruta: "/api/cxp/1" },
  { metodo: "delete", ruta: "/api/cxp/1" },
  { metodo: "post", ruta: "/api/cxp/1/pagos" },
  // cartera: provisión
  { metodo: "get", ruta: "/api/cartera/provision/parametros" },
  { metodo: "put", ruta: "/api/cartera/provision/parametros" },
  { metodo: "post", ruta: "/api/cartera/provision/calcular/1" },
  { metodo: "get", ruta: "/api/cartera/provision/1" },
  // productos e inventario
  { metodo: "get", ruta: "/api/productos" },
  { metodo: "post", ruta: "/api/productos" },
  { metodo: "patch", ruta: "/api/productos/1" },
  { metodo: "delete", ruta: "/api/productos/1" },
  { metodo: "get", ruta: "/api/productos/1/movimientos" },
  { metodo: "post", ruta: "/api/productos/1/movimientos" },
  // activos fijos
  { metodo: "get", ruta: "/api/activos-fijos" },
  { metodo: "post", ruta: "/api/activos-fijos" },
  { metodo: "patch", ruta: "/api/activos-fijos/1" },
  { metodo: "post", ruta: "/api/activos-fijos/1/baja" },
  { metodo: "post", ruta: "/api/activos-fijos/depreciar/1" },
  { metodo: "get", ruta: "/api/activos-fijos/1/depreciaciones" },
  // auditoría
  { metodo: "get", ruta: "/api/auditoria" },
  // cierre anual
  { metodo: "get", ruta: "/api/cierre-anual" },
  { metodo: "get", ruta: "/api/cierre-anual/2026" },
  { metodo: "post", ruta: "/api/cierre-anual/2026" },
  // empleados
  { metodo: "get", ruta: "/api/empleados" },
  { metodo: "post", ruta: "/api/empleados" },
  { metodo: "patch", ruta: "/api/empleados/1" },
  { metodo: "post", ruta: "/api/empleados/1/retiro" },
  { metodo: "get", ruta: "/api/empleados/1/liquidaciones" },
  // nómina
  { metodo: "get", ruta: "/api/nomina/parametros" },
  { metodo: "put", ruta: "/api/nomina/parametros/2026" },
  { metodo: "get", ruta: "/api/nomina/parametros-cuentas" },
  { metodo: "put", ruta: "/api/nomina/parametros-cuentas" },
  { metodo: "get", ruta: "/api/nomina/provision/1" },
  { metodo: "post", ruta: "/api/nomina/provisionar/1" },
  { metodo: "post", ruta: "/api/nomina/contabilizar/1" },
  { metodo: "post", ruta: "/api/nomina/liquidar/1" },
  { metodo: "get", ruta: "/api/nomina/1" },
  // presupuesto
  { metodo: "get", ruta: "/api/presupuesto/1/ejecucion" },
  { metodo: "get", ruta: "/api/presupuesto/1" },
  { metodo: "put", ruta: "/api/presupuesto/1" },
  // procesos (la ruta global /api/procesos/cartera no usa requireEmpresa)
  { metodo: "get", ruta: "/api/procesos" },
  { metodo: "post", ruta: "/api/procesos" },
  { metodo: "get", ruta: "/api/procesos/1" },
  { metodo: "patch", ruta: "/api/procesos/1" },
  { metodo: "delete", ruta: "/api/procesos/1" },
  { metodo: "patch", ruta: "/api/procesos/1/actividades/1" },
  { metodo: "post", ruta: "/api/procesos/1/notas" },
  // resumen
  { metodo: "get", ruta: "/api/resumen" },
  // alertas
  { metodo: "get", ruta: "/api/alertas" },
  { metodo: "get", ruta: "/api/alertas/reglas" },
  { metodo: "put", ruta: "/api/alertas/reglas" },
  // adjuntos
  { metodo: "post", ruta: "/api/adjuntos" },
  { metodo: "get", ruta: "/api/adjuntos" },
  { metodo: "get", ruta: "/api/adjuntos/1/descargar" },
  { metodo: "delete", ruta: "/api/adjuntos/1" },
  // conciliación
  { metodo: "get", ruta: "/api/conciliaciones" },
  { metodo: "get", ruta: "/api/conciliaciones/1" },
  { metodo: "post", ruta: "/api/conciliaciones" },
  { metodo: "post", ruta: "/api/conciliaciones/importar" },
  { metodo: "post", ruta: "/api/conciliaciones/1/cruzar" },
  { metodo: "post", ruta: "/api/conciliaciones/1/aprobar" },
  { metodo: "post", ruta: "/api/conciliaciones/1/anular" },
];

const email = "aislamiento@test.local";

let token = "";
let empresaB = "";

describe("Aislamiento entre empresas: 403 en todas las rutas con requireEmpresa", () => {
  beforeAll(async () => {
    await prisma.usuario.deleteMany({ where: { email } });
    await empresaDePrueba();
    const b = await prisma.empresa.create({ data: { nombre: "Empresa Aislada B", nit: "888888888" } });
    empresaB = b.id;
    await prisma.usuario.create({
      data: { nombre: "Aislamiento Contador", email, passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" },
    });
    const login = await request(app).post("/api/auth/login").send({ email, password: "clave123" });
    token = login.body.token;
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { email } });
    await prisma.empresa.deleteMany({ where: { id: empresaB } });
    await prisma.$disconnect();
  });

  it.each(RUTAS)("$metodo $ruta responde 403 sin vínculo a la empresa", async ({ metodo, ruta }) => {
    const res = await (request(app) as unknown as { [m in Metodo]: (p: string) => { set: (...a: unknown[]) => unknown } })[metodo](ruta)
      .set("Authorization", `Bearer ${token}`)
      .set("x-empresa-id", empresaB);
    expect(res.status).toBe(403);
  });
});
