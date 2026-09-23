import { PrismaClient } from "@prisma/client";
import { empresaDePrueba } from "./helpers.js";

const EMPRESA_REQUERIDA = new Set<string>([
  "Tercero",
  "Periodo",
  "Comprobante",
  "Consecutivo",
  "CuentaPorCobrar",
  "CuentaPorPagar",
  "Producto",
  "ActivoFijo",
  "ParametroCuentaNomina",
  "CierreAnual",
  "Adjunto",
  "Conciliacion",
]);

const base = new PrismaClient();

type ArgsConDatos = { data?: unknown | unknown[] };

type ArgsUsuarioDelete = { where?: { email?: unknown; id?: unknown } };

// Los tests eliminan usuarios propios tras loguearse (que ahora deja LOGIN_OK en la
// bitácora); quitar antes sus registros de auditoría para no violar la FK usuarioId.
async function purgarAuditoriaDeUsuarios(args: ArgsUsuarioDelete): Promise<void> {
  const where = args.where ?? {};
  const clausulas: { email?: unknown; id?: unknown }[] = [];
  if (where.email) clausulas.push({ email: where.email });
  if (where.id) clausulas.push({ id: where.id });
  const usuarios = await base.usuario.findMany({
    where: clausulas.length ? { OR: clausulas } : undefined,
    select: { id: true },
  });
  if (usuarios.length > 0) {
    await base.auditoria.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
  }
}

export const prisma = base.$extends({
  query: {
    usuario: {
      async delete({ args, query }) {
        await purgarAuditoriaDeUsuarios(args as ArgsUsuarioDelete);
        return query(args);
      },
      async deleteMany({ args, query }) {
        await purgarAuditoriaDeUsuarios(args as ArgsUsuarioDelete);
        return query(args);
      },
    },
    $allModels: {
      async create({ args, query, model }) {
        if (EMPRESA_REQUERIDA.has(model)) {
          const data = (args as ArgsConDatos).data as { empresaId?: string } | undefined;
          if (data && !data.empresaId) data.empresaId = await empresaDePrueba();
        }
        return query(args);
      },
      async createMany({ args, query, model }) {
        if (EMPRESA_REQUERIDA.has(model)) {
          const data = (args as ArgsConDatos).data as Array<{ empresaId?: string }> | { empresaId?: string };
          const items = Array.isArray(data) ? data : data ? [data] : [];
          const eid = await empresaDePrueba();
          for (const item of items) if (!item.empresaId) item.empresaId = eid;
        }
        return query(args);
      },
    },
  },
});
