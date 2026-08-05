import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { cargarReglas, evaluarAlertas } from "../lib/alertas.js";
import { TipoAlerta } from "@prisma/client";

export async function listar(req: Request, res: Response): Promise<void> {
  const alertas = await evaluarAlertas();
  res.json({ alertas, fecha: new Date().toISOString() });
}

export async function listarReglas(req: Request, res: Response): Promise<void> {
  res.json(await cargarReglas());
}

const reglasSchema = z.object({
  reglas: z
    .array(
      z.object({
        tipo: z.nativeEnum(TipoAlerta),
        dias: z.number().int().nullable().optional(),
        activa: z.boolean(),
      })
    )
    .min(1)
    .max(50),
});

export async function actualizarReglas(req: Request, res: Response): Promise<void> {
  const parsed = reglasSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detalle: parsed.error.flatten() });
    return;
  }
  const resultado = await prisma.$transaction(async (tx) => {
    const out: { tipo: TipoAlerta; dias: number | null; activa: boolean }[] = [];
    for (const r of parsed.data.reglas) {
      const dias = r.dias === null || r.dias === undefined ? null : Math.max(1, r.dias);
      const actualizada = await tx.reglaAlerta.upsert({
        where: { tipo: r.tipo },
        update: { dias, activa: r.activa },
        create: { tipo: r.tipo, dias, activa: r.activa },
      });
      out.push({ tipo: actualizada.tipo, dias: actualizada.dias, activa: actualizada.activa });
    }
    return out;
  });
  res.json(resultado);
}
