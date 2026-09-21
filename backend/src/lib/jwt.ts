import jwt from "jsonwebtoken";

const SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s || s === "dev-secret") {
    throw new Error(
      "JWT_SECRET no está definido en el entorno (o es el valor por defecto 'dev-secret'). El servidor no arranca por seguridad."
    );
  }
  return s;
})();

export const TOKEN_TTL = "4h";

export interface TokenPayload {
  sub: string;
  rol: string;
  nombre: string;
}

const OPCIONES: jwt.SignOptions = { expiresIn: TOKEN_TTL, algorithm: "HS256" };

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, OPCIONES);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET, { algorithms: ["HS256"] }) as unknown as TokenPayload;
}