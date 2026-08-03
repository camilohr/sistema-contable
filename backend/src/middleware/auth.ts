import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export interface AuthUser {
  sub: string;
  rol: string;
  nombre: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  let payload;
  try {
    payload = verifyToken(header.slice(7));
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  let usuario;
  try {
    usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { activo: true, debeCambiarPassword: true, rol: true, nombre: true },
    });
  } catch (err) {
    next(err);
    return;
  }
  if (!usuario) {
    res.status(401).json({ error: "Usuario no encontrado" });
    return;
  }
  if (!usuario.activo) {
    res.status(401).json({ error: "Usuario inactivo" });
    return;
  }

  req.user = { sub: payload.sub, rol: usuario.rol, nombre: usuario.nombre };

  const rutaLibre = req.baseUrl === "/api/auth" && (req.path === "/me" || req.path === "/cambiar-password");
  if (usuario.debeCambiarPassword && !rutaLibre) {
    res.status(403).json({ error: "Debe cambiar su contraseña antes de continuar", codigo: "DEBE_CAMBIAR_PASSWORD" });
    return;
  }

  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.rol)) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    next();
  };
}
