import request from "supertest";
import { prisma } from "../src/lib/prisma.js";

let empresaCache: string | undefined;

export async function empresaDePrueba(): Promise<string> {
  if (empresaCache) return empresaCache;
  const existente = await prisma.empresa.findFirst({ orderBy: { createdAt: "asc" } });
  if (existente) {
    empresaCache = existente.id;
    return existente.id;
  }
  const creada = await prisma.empresa.create({
    data: { nombre: "Empresa Test", nit: "111111111" },
  });
  empresaCache = creada.id;
  return creada.id;
}

export async function vincularUsuarios(empresaId?: string): Promise<string> {
  const eid = empresaId ?? (await empresaDePrueba());
  const usuarios = await prisma.usuario.findMany({ where: { activo: true } });
  for (const usuario of usuarios) {
    await prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: eid } },
      update: { rol: usuario.rol, activo: true },
      create: { usuarioId: usuario.id, empresaId: eid, rol: usuario.rol },
    });
  }
  return eid;
}

type TestProto = {
  _header?: Record<string, string>;
  set: (...args: unknown[]) => unknown;
  end: (cb?: unknown) => unknown;
};

const testProto = request.Test.prototype as unknown as TestProto;
const setOriginal = testProto.set;
const endOriginal = testProto.end;

let vinculosListos = false;

testProto.set = function setConEmpresa(field: unknown, value: unknown) {
  const self = this as TestProto;
  const resultado = setOriginal.call(this, field, value);
  if (String(field).toLowerCase() !== "x-empresa-id" && !self._header?.["x-empresa-id"] && empresaCache) {
    setOriginal.call(this, "x-empresa-id", empresaCache);
  }
  return resultado;
};

testProto.end = function endConEmpresa(this: TestProto, cb?: unknown) {
  const self = this;
  const prev = () => endOriginal.call(self, cb);
  return Promise.resolve()
    .then(() => (vinculosListos ? empresaCache : vincularUsuarios()))
    .then((eid) => {
      vinculosListos = true;
      if (eid && !self._header?.["x-empresa-id"]) {
        setOriginal.call(self, "x-empresa-id", eid);
      }
      return prev();
    });
};
