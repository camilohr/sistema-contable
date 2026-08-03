import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "dev-secret";
export const TOKEN_TTL = "12h";

export interface TokenPayload {
  sub: string;
  rol: string;
  nombre: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}
