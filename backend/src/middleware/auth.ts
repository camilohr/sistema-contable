import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export interface AuthUser {
  sub: string;
  rol: string;
  nombre: string;
}

export interface EmpresaContext {
  id: string;
  nombre: string;
  nit: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      empresaId: string;
      rolEfectivo?: string;
      empresa?: EmpresaContext;
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

const EMPRESA_HEADER = "x-empresa-id";

const RANGO_ROL: Record<string, number> = { AUXILIAR: 1, CONTADOR: 2, ADMIN: 3 };

export function rolMasRestrictivo(a: string, b: string): string {
  return RANGO_ROL[a] <= RANGO_ROL[b] ? a : b;
}

export async function requireEmpresa(req: Request, res: Response, next: NextFunction): Promise<void> {
  const empresaId = (req.headers[EMPRESA_HEADER] as string | undefined)?.trim();
  if (!empresaId) {
    res.status(400).json({ error: "Debe indicar la empresa activa en la cabecera X-Empresa-Id" });
    return;
  }
  let empresa;
  try {
    empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  } catch (err) {
    next(err);
    return;
  }
  if (!empresa || !empresa.activa) {
    res.status(403).json({ error: "Acceso denegado a esta empresa" });
    return;
  }
  const rolGlobal = req.user!.rol;
  if (rolGlobal === "ADMIN") {
    req.empresaId = empresa.id;
    req.rolEfectivo = "ADMIN";
    req.empresa = { id: empresa.id, nombre: empresa.nombre, nit: empresa.nit };
    next();
    return;
  }
  let vinculo;
  try {
    vinculo = await prisma.usuarioEmpresa.findUnique({
      where: { usuarioId_empresaId: { usuarioId: req.user!.sub, empresaId } },
    });
  } catch (err) {
    next(err);
    return;
  }
  if (!vinculo || !vinculo.activo) {
    res.status(403).json({ error: "Acceso denegado a esta empresa" });
    return;
  }
  req.empresaId = vinculo.empresaId;
  req.rolEfectivo = rolMasRestrictivo(rolGlobal, vinculo.rol);
  req.empresa = { id: empresa.id, nombre: empresa.nombre, nit: empresa.nit };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rol = req.rolEfectivo ?? req.user?.rol;
    if (!rol || !roles.includes(rol)) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    next();
  };
}
