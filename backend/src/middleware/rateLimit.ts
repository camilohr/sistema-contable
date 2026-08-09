import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";
import { AccionAuditoria } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

function emailDelBody(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

const EN_TESTS = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

/**
 * Limita intentos de login (5 por IP+email cada 15 minutos).
 * Cuando se supera el límite se registra el bloqueo en la bitácora de
 * auditoría (si el email corresponde a un usuario existente) y se responde 429.
 *
 * En el entorno de tests el limitador se desactiva por defecto; el test que
 * cubre la política de bloqueo lo rehabilita explícitamente con un límite bajo.
 */
export function createLoginLimiter(options: { limit?: number; windowMs?: number; skipApp?: boolean } = {}) {
  const { limit, windowMs } = options;
  const skipEnTests = options.skipApp !== undefined ? options.skipApp : EN_TESTS;

  return rateLimit({
    windowMs: windowMs ?? 15 * 60 * 1000,
    limit: limit ?? 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => skipEnTests,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "unknown")}:${emailDelBody((req.body as { email?: unknown })?.email)}`,
    handler: async (req: Request, res: Response) => {
      try {
        const email = emailDelBody((req.body as { email?: unknown })?.email);
        if (email) {
          const usuario = await prisma.usuario.findUnique({ where: { email } });
          if (usuario) {
            await prisma.auditoria.create({
              data: {
                usuarioId: usuario.id,
                empresaId: null,
                accion: AccionAuditoria.LOGIN_BLOQUEADO,
                entidad: "Usuario",
                entidadId: usuario.id,
                detalle: { ip: req.ip, ruta: req.originalUrl },
              },
            });
          }
        }
      } catch {
        // Un fallo al registrar la auditoría no debe impedir devolver el 429.
      }
      res.status(429).json({ error: "Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos." });
    },
  });
}

export const loginLimiter = createLoginLimiter();