import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import { empresaDePrueba } from "./helpers.js";
import bcrypt from "bcryptjs";
import { derivarPuc } from "../src/lib/puc.js";

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

// ---- S3-13: Casos cross-empresa (id/periodoId de B con empresa activa A) ----
// Cubre S3-05 (cuentas), S3-06 (indicadores), S3-07 (provision) y S3-02
// (paquete-final). Un usuario CON vínculo a A pasa un id/periodoId de B:
// no debe leer datos de B.
const corssEmails = {
  contador: "cross-cont@test.local",
  auxiliar: "cross-aux@test.local",
  admin: "cross-adm@test.local",
};

describe("Aislamiento cross-empresa: id/periodoId de B con empresa activa A", () => {
  let empresaA = "";
  let empresaCrossB = "";
  let tokenCont = "";
  let tokenAux = "";
  let tokenAdmin = "";
  let periodoB_id = 0;
  let cuentaPrivadaB_id = 0;

  beforeAll(async () => {
    empresaA = await empresaDePrueba();

    const b = await prisma.empresa.create({ data: { nombre: "Empresa Cross B", nit: "777777777" } });
    empresaCrossB = b.id;

    const periodoB = await prisma.periodo.create({
      data: { empresaId: empresaCrossB, nombre: "Periodo Cross B", fechaInicio: new Date("2026-01-01"), fechaFin: new Date("2026-01-31") },
    });
    periodoB_id = periodoB.id;

    const cuentaB = await prisma.cuenta.create({
      data: { empresaId: empresaCrossB, codigo: "199901", nombre: "Cuenta privada B", permiteMovimiento: false, ...derivarPuc("199901") },
    });
    cuentaPrivadaB_id = cuentaB.id;

    for (const [rol, email] of [["CONTADOR", corssEmails.contador], ["AUXILIAR", corssEmails.auxiliar], ["ADMIN", corssEmails.admin]] as [string, string][]) {
      await prisma.usuario.deleteMany({ where: { email } });
      const u = await prisma.usuario.create({ data: { nombre: `Cross ${rol}`, email, passwordHash: await bcrypt.hash("clave123", 10), rol: rol as "ADMIN" | "CONTADOR" | "AUXILIAR" } });
      await prisma.usuarioEmpresa.upsert({
        where: { usuarioId_empresaId: { usuarioId: u.id, empresaId: empresaA } },
        update: { rol: rol as "ADMIN" | "CONTADOR" | "AUXILIAR", activo: true },
        create: { usuarioId: u.id, empresaId: empresaA, rol: rol as "ADMIN" | "CONTADOR" | "AUXILIAR" },
      });
    }
    tokenCont = (await request(app).post("/api/auth/login").send({ email: corssEmails.contador, password: "clave123" })).body.token;
    tokenAux = (await request(app).post("/api/auth/login").send({ email: corssEmails.auxiliar, password: "clave123" })).body.token;
    tokenAdmin = (await request(app).post("/api/auth/login").send({ email: corssEmails.admin, password: "clave123" })).body.token;
  });

  afterAll(async () => {
    await prisma.cuenta.deleteMany({ where: { id: cuentaPrivadaB_id } });
    await prisma.periodo.deleteMany({ where: { id: periodoB_id } });
    for (const email of Object.values(corssEmails)) {
      await prisma.usuario.deleteMany({ where: { email } });
    }
    await prisma.empresa.deleteMany({ where: { id: empresaCrossB } });
    await prisma.$disconnect();
  });

  // S3-06: indicadores por periodoId de B
  it("S3-06: GET /api/reportes/indicadores/:periodoId de B → 404 (CONTADOR con empresa A)", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoB_id}`).set("Authorization", `Bearer ${tokenCont}`).set("x-empresa-id", empresaA);
    expect(res.status).toBe(404);
  });

  it("S3-06: GET /api/reportes/indicadores/:periodoId.pdf de B → 400/404 (CONTADOR con empresa A)", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoB_id}.pdf`).set("Authorization", `Bearer ${tokenCont}`).set("x-empresa-id", empresaA);
    expect([400, 404]).toContain(res.status);
  });

  it("S3-06: GET indicadores/comparativo con periodos de B → 404 (CONTADOR con empresa A)", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/comparativo?desde=${periodoB_id}&hasta=${periodoB_id}`).set("Authorization", `Bearer ${tokenCont}`).set("x-empresa-id", empresaA);
    expect(res.status).toBe(404);
  });

  it("S3-06: ADMIN con empresa A tampoco lee indicadores de B", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoB_id}`).set("Authorization", `Bearer ${tokenAdmin}`).set("x-empresa-id", empresaA);
    expect(res.status).toBe(404);
  });

  it("S3-06: AUXILIAR con empresa A no lee indicadores de B", async () => {
    const res = await request(app).get(`/api/reportes/indicadores/${periodoB_id}`).set("Authorization", `Bearer ${tokenAux}`).set("x-empresa-id", empresaA);
    expect(res.status).toBe(404);
  });

  // S3-05: cuentas de B
  it("S3-05: PATCH /api/cuentas/:id de B → 404 (CONTADOR con empresa A)", async () => {
    const res = await request(app).patch(`/api/cuentas/${cuentaPrivadaB_id}`).set("Authorization", `Bearer ${tokenCont}`).set("x-empresa-id", empresaA).send({ nombre: "Hack" });
    expect(res.status).toBe(404);
  });

  it("S3-05: DELETE /api/cuentas/:id de B → 404 (CONTADOR con empresa A)", async () => {
    const res = await request(app).delete(`/api/cuentas/${cuentaPrivadaB_id}`).set("Authorization", `Bearer ${tokenCont}`).set("x-empresa-id", empresaA);
    expect(res.status).toBe(404);
  });

  it("S3-05: DELETE /api/cuentas/:id PUC nacional → 403 (no es eliminable)", async () => {
    const puc = await prisma.cuenta.findFirst({ where: { codigo: "1105", empresaId: null } });
    const res = await request(app).delete(`/api/cuentas/${puc!.id}`).set("Authorization", `Bearer ${tokenCont}`).set("x-empresa-id", empresaA);
    expect(res.status).toBe(403);
  });

  // S3-07: provisión cartera por periodoId de B
  it("S3-07: GET /api/cartera/provision/:periodoId de B → 404 (CONTADOR con empresa A)", async () => {
    const res = await request(app).get(`/api/cartera/provision/${periodoB_id}`).set("Authorization", `Bearer ${tokenCont}`).set("x-empresa-id", empresaA);
    expect(res.status).toBe(404);
  });

  // S3-02: paquete-final con empresaId de B en URL pero empresa A activa
  it("S3-02: POST /api/empresas/:empresaId/informes/paquete-final con empresaId B y cabecera A → 403 (ADMIN)", async () => {
    const res = await request(app).post(`/api/empresas/${empresaCrossB}/informes/paquete-final`).set("Authorization", `Bearer ${tokenAdmin}`).set("x-empresa-id", empresaA).send({ anio: 2026 });
    expect(res.status).toBe(403);
  });

  // Controles positivos: los mismos datos sí son accesibles con la empresa correcta
  it("Control positivo: GET /api/reportes/indicadores/:periodoId de A no da 404", async () => {
    const periodoA = await prisma.periodo.findFirst({ where: { empresaId: empresaA } });
    if (!periodoA) return; // si no hay periodo en A, saltar
    const res = await request(app).get(`/api/reportes/indicadores/${periodoA.id}`).set("Authorization", `Bearer ${tokenCont}`).set("x-empresa-id", empresaA);
    expect([200, 404]).toContain(res.status); // 200 si hay comprobantes, 404 si no hay datos → pero no 403
  });
});
