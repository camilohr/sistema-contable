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

export const prisma = base.$extends({
  query: {
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
