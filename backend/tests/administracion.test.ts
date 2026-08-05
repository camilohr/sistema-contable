import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { prisma } from "./prisma-test.js";
import { empresaDePrueba } from "./helpers.js";

const app = createApp();

const emails = {
  admin: "adm-admin@test.local",
  aux: "adm-aux@test.local",
  cont: "adm-cont@test.local",
  nuevo: "adm-nuevo@test.local",
};
const suf = Date.now();
const procesoAnio = 2035;

let empresaId = "";
let empresaNoVinculada = "";
let adminId = "";
let auxId = "";
let contId = "";
let nuevoId = "";
let adminToken = "";
let auxToken = "";
let contToken = "";
let nuevoToken = "";

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body.token;
}

async function buscarAuditoria(accion: string, entidadId: string | number) {
  return prisma.auditoria.findFirst({
    where: { accion: accion as never, entidadId: String(entidadId) },
    orderBy: { id: "desc" },
  });
}

interface RespuestaArchivo {
  body: unknown;
  text?: string;
}

function cuerpoBinario(res: RespuestaArchivo): Buffer {
  if (Buffer.isBuffer(res.body)) return res.body;
  return Buffer.from(res.text ?? "", "latin1");
}

beforeAll(async () => {
  empresaId = await empresaDePrueba();

  const admin = await prisma.usuario.create({ data: { nombre: "Adm Admin", email: emails.admin, passwordHash: await bcrypt.hash("clave123", 10), rol: "ADMIN" } });
  const aux = await prisma.usuario.create({ data: { nombre: "Adm Aux", email: emails.aux, passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  const cont = await prisma.usuario.create({ data: { nombre: "Adm Cont", email: emails.cont, passwordHash: await bcrypt.hash("clave123", 10), rol: "CONTADOR" } });
  const nuevo = await prisma.usuario.create({ data: { nombre: "Adm Nuevo", email: emails.nuevo, passwordHash: await bcrypt.hash("clave123", 10), rol: "AUXILIAR" } });
  adminId = admin.id;
  auxId = aux.id;
  contId = cont.id;
  nuevoId = nuevo.id;

  empresaNoVinculada = (
    await prisma.empresa.create({ data: { nombre: `Empresa sin vinculo ${suf}`, nit: `9000${suf}` } })
  ).id;

  adminToken = await login(emails.admin, "clave123");
  auxToken = await login(emails.aux, "clave123");
  contToken = await login(emails.cont, "clave123");
  nuevoToken = await login(emails.nuevo, "clave123");
});

afterAll(async () => {
  await prisma.auditoria.deleteMany({ where: { usuarioId: { in: [adminId, auxId, contId, nuevoId] } } });
  await prisma.actividadProceso.deleteMany({ where: { proceso: { empresaId: { in: [empresaNoVinculada, empresaId] }, anio: procesoAnio } } });
  await prisma.notaSeguimiento.deleteMany({ where: { proceso: { empresaId: { in: [empresaNoVinculada, empresaId] }, anio: procesoAnio } } });
  await prisma.procesoContable.deleteMany({ where: { empresaId: { in: [empresaNoVinculada, empresaId] }, anio: procesoAnio } });
  await prisma.periodo.deleteMany({ where: { empresaId: empresaNoVinculada } });
  await prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: { in: [adminId, auxId, contId, nuevoId] } } });
  await prisma.usuario.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.empresa.deleteMany({ where: { id: { in: [empresaNoVinculada] } } });
  await prisma.$disconnect();
});

describe("Acceso implícito del ADMIN global y aislamiento por empresa", () => {
  it("ADMIN accede a una empresa sin vínculo (200)", async () => {
    const res = await request(app)
      .get("/api/periodos")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Empresa-Id", empresaNoVinculada);
    expect(res.status).toBe(200);
  });

  it("AUXILIAR sin vínculo recibe 403", async () => {
    const res = await request(app)
      .get("/api/periodos")
      .set("Authorization", `Bearer ${auxToken}`)
      .set("X-Empresa-Id", empresaNoVinculada);
    expect(res.status).toBe(403);
  });

  it("listar empresas para ADMIN incluye todas las activas", async () => {
    const res = await request(app).get("/api/empresas").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((e) => e.id);
    expect(ids).toContain(empresaNoVinculada);
    expect(ids).toContain(empresaId);
    expect((res.body as { rol: string }[]).every((e) => e.rol === "ADMIN")).toBe(true);
  });

  it("listar empresas para AUXILIAR solo devuelve las asignadas", async () => {
    const res = await request(app).get("/api/empresas").set("Authorization", `Bearer ${auxToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((e) => e.id);
    expect(ids).toContain(empresaId);
    expect(ids).not.toContain(empresaNoVinculada);
    expect((res.body as { rol: string }[]).every((e) => e.rol === "AUXILIAR")).toBe(true);
  });
});

describe("Rol efectivo: el más restrictivo entre el rol global y el de la empresa", () => {
  it("CONTADOR global con vínculo AUXILIAR no puede escribir", async () => {
    await prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId: contId, empresaId } },
      data: { rol: "AUXILIAR" },
    });
    const res = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${contToken}`)
      .send({ nombre: "X", fechaInicio: "2026-01-01", fechaFin: "2026-01-31" });
    expect(res.status).toBe(403);
    await prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId: contId, empresaId } },
      data: { rol: "CONTADOR" },
    });
  });

  it("CONTADOR global con vínculo CONTADOR sí puede escribir", async () => {
    const res = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${contToken}`)
      .send({});
    expect(res.status).not.toBe(403);
  });

  it("AUXILIAR global con vínculo CONTADOR no se eleva (escribe queda 403)", async () => {
    await prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId: auxId, empresaId } },
      update: { rol: "CONTADOR" },
      create: { usuarioId: auxId, empresaId, rol: "CONTADOR" },
    });
    const res = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${auxToken}`)
      .send({ nombre: "X", fechaInicio: "2026-01-01", fechaFin: "2026-01-31" });
    expect(res.status).toBe(403);
    await prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId: auxId, empresaId } },
      data: { rol: "AUXILIAR" },
    });
  });

  it("CONTADOR global con vínculo ADMIN no gana acceso de administración", async () => {
    await prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId: contId, empresaId } },
      data: { rol: "ADMIN" },
    });
    const res = await request(app).get("/api/usuarios").set("Authorization", `Bearer ${contToken}`);
    expect(res.status).toBe(403);
    await prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId: contId, empresaId } },
      data: { rol: "CONTADOR" },
    });
  });
});

describe("Gestión de clientes (/api/empresas)", () => {
  let creadaId = "";

  it("solo ADMIN puede listar administración (403 para CONTADOR)", async () => {
    const res = await request(app).get("/api/empresas/administracion").set("Authorization", `Bearer ${contToken}`);
    expect(res.status).toBe(403);
    const ok = await request(app).get("/api/empresas/administracion").set("Authorization", `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body)).toBe(true);
  });

  it("crear empresa registra CREAR_EMPRESA y crea el proceso del año", async () => {
    const res = await request(app)
      .post("/api/empresas")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: `Cliente nuevo ${suf}`, nit: `9001${suf}` });
    expect(res.status).toBe(201);
    creadaId = res.body.id;

    const reg = await buscarAuditoria("CREAR_EMPRESA", creadaId);
    expect(reg).toBeTruthy();
    const proceso = await prisma.procesoContable.findFirst({ where: { empresaId: creadaId } });
    expect(proceso).toBeTruthy();
    expect(proceso?.anio).toBe(new Date().getFullYear());

    const listado = await request(app).get("/api/empresas").set("Authorization", `Bearer ${adminToken}`);
    expect((listado.body as { id: string }[]).map((e) => e.id)).toContain(creadaId);
  });

  it("AUXILIAR no puede crear empresa (403)", async () => {
    const res = await request(app)
      .post("/api/empresas")
      .set("Authorization", `Bearer ${auxToken}`)
      .send({ nombre: "No", nit: "1" });
    expect(res.status).toBe(403);
  });

  it("editar empresa registra EDITAR_EMPRESA", async () => {
    const res = await request(app)
      .patch(`/api/empresas/${creadaId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ direccion: "Calle 1" });
    expect(res.status).toBe(200);
    const reg = await buscarAuditoria("EDITAR_EMPRESA", creadaId);
    expect(reg).toBeTruthy();
    expect((reg?.detalle as { cambios?: { direccion?: string } })?.cambios?.direccion).toBe("Calle 1");
  });

  it("dar de baja (inactiva) bloquea el acceso y registra DESACTIVAR_EMPRESA", async () => {
    const res = await request(app)
      .patch(`/api/empresas/${creadaId}/estado`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ activa: false });
    expect(res.status).toBe(200);

    const reg = await buscarAuditoria("DESACTIVAR_EMPRESA", creadaId);
    expect(reg).toBeTruthy();

    const acceso = await request(app)
      .get("/api/periodos")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Empresa-Id", creadaId);
    expect(acceso.status).toBe(403);

    const reactivar = await request(app)
      .patch(`/api/empresas/${creadaId}/estado`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ activa: true });
    expect(reactivar.status).toBe(200);
    const regAct = await buscarAuditoria("ACTIVAR_EMPRESA", creadaId);
    expect(regAct).toBeTruthy();
  });

  it("la baja ordenada genera el paquete final de informes (ZIP) para cualquier empresa", async () => {
    const periodo = await prisma.periodo.create({
      data: {
        empresaId: empresaNoVinculada,
        nombre: `EXT-${suf}`,
        fechaInicio: new Date("2026-03-01"),
        fechaFin: new Date("2026-03-31"),
      },
    });
    const res = await request(app)
      .post(`/api/empresas/${empresaNoVinculada}/informes/paquete-final`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ anio: 2026 });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    const buf = cuerpoBinario(res);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buf.length).toBeGreaterThan(0);
    await prisma.periodo.delete({ where: { id: periodo.id } });
  });

  it("CONTADOR no puede descargar el paquete final de otro cliente (403)", async () => {
    const res = await request(app)
      .post(`/api/empresas/${empresaNoVinculada}/informes/paquete-final`)
      .set("Authorization", `Bearer ${contToken}`)
      .send({ anio: 2026 });
    expect(res.status).toBe(403);
  });

  afterAll(async () => {
    if (creadaId) {
      await prisma.auditoria.deleteMany({ where: { empresaId: creadaId } });
      await prisma.procesoContable.deleteMany({ where: { empresaId: creadaId } });
      await prisma.empresa.deleteMany({ where: { id: creadaId } });
    }
  });
});

describe("Administración de usuarios por empresa (/api/usuarios)", () => {
  it("listar disponibles excluye a los ya asignados", async () => {
    await prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: nuevoId } });
    const res = await request(app).get("/api/usuarios/disponibles").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((u) => u.id);
    expect(ids).toContain(nuevoId);
    expect(ids).not.toContain(adminId);
  });

  it("vincular a la empresa registra ASIGNAR_USUARIO_EMPRESA", async () => {
    const res = await request(app)
      .post(`/api/usuarios/${nuevoId}/vincular`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rol: "CONTADOR" });
    expect(res.status).toBe(201);
    const reg = await buscarAuditoria("ASIGNAR_USUARIO_EMPRESA", nuevoId);
    expect(reg).toBeTruthy();
  });

  it("el usuario asignado accede a la empresa pero mantiene su rol global (403 en escritura)", async () => {
    const lect = await request(app).get("/api/periodos").set("Authorization", `Bearer ${nuevoToken}`);
    expect(lect.status).toBe(200);
    const esc = await request(app)
      .post("/api/periodos")
      .set("Authorization", `Bearer ${nuevoToken}`)
      .send({ nombre: "X", fechaInicio: "2026-01-01", fechaFin: "2026-01-31" });
    expect(esc.status).toBe(403);
  });

  it("cambiar rol en la empresa registra CAMBIAR_ROL_EMPRESA", async () => {
    const res = await request(app)
      .patch(`/api/usuarios/${nuevoId}/rol`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rol: "ADMIN" });
    expect(res.status).toBe(200);
    const reg = await buscarAuditoria("CAMBIAR_ROL_EMPRESA", nuevoId);
    expect(reg).toBeTruthy();
    expect((reg?.detalle as { rolNuevo?: string })?.rolNuevo).toBe("ADMIN");
  });

  it("retirar de la empresa registra RETIRAR_USUARIO_EMPRESA y revoca el acceso", async () => {
    const res = await request(app)
      .delete(`/api/usuarios/${nuevoId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const reg = await buscarAuditoria("RETIRAR_USUARIO_EMPRESA", nuevoId);
    expect(reg).toBeTruthy();

    const acceso = await request(app).get("/api/periodos").set("Authorization", `Bearer ${nuevoToken}`);
    expect(acceso.status).toBe(403);
  });

  it("no puede retirarse a sí mismo", async () => {
    const res = await request(app)
      .delete(`/api/usuarios/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("Bitácora de auditoría del proceso", () => {
  let procesoId = "";

  it("crear, actualizar, marcar actividad, nota y eliminar quedan auditados", async () => {
    await prisma.actividadProceso.deleteMany({ where: { proceso: { empresaId, anio: procesoAnio } } });
    await prisma.notaSeguimiento.deleteMany({ where: { proceso: { empresaId, anio: procesoAnio } } });
    await prisma.procesoContable.deleteMany({ where: { empresaId, anio: procesoAnio } });

    const creado = await request(app)
      .post("/api/procesos")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ anio: procesoAnio });
    expect(creado.status).toBe(201);
    procesoId = creado.body.id;

    const regCrear = await buscarAuditoria("CREAR_PROCESO", procesoId);
    expect(regCrear).toBeTruthy();

    const actualizado = await request(app)
      .patch(`/api/procesos/${procesoId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ estado: "EN_PROCESO" });
    expect(actualizado.status).toBe(200);
    const regAct = await buscarAuditoria("ACTUALIZAR_PROCESO", procesoId);
    expect(regAct).toBeTruthy();

    const actividad = (creado.body as { actividades: { id: number }[] }).actividades[0];
    const marcada = await request(app)
      .patch(`/api/procesos/${procesoId}/actividades/${actividad.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ estado: true });
    expect(marcada.status).toBe(200);
    const regMarcar = await buscarAuditoria("MARCAR_ACTIVIDAD", procesoId);
    expect(regMarcar).toBeTruthy();

    const nota = await request(app)
      .post(`/api/procesos/${procesoId}/notas`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ texto: "Nota de seguimiento Fase 5" });
    expect(nota.status).toBe(201);
    const regNota = await buscarAuditoria("AGREGAR_NOTA", procesoId);
    expect(regNota).toBeTruthy();

    const eliminado = await request(app)
      .delete(`/api/procesos/${procesoId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(eliminado.status).toBe(200);
    const regEliminar = await buscarAuditoria("ELIMINAR_PROCESO", procesoId);
    expect(regEliminar).toBeTruthy();
  });
});
