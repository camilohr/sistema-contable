import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

// B4: los rounds de bcrypt nunca deben quedar por debajo de 12,
// aunque BCRYPT_ROUNDS lo pida más bajo.
export function redondeosBcrypt(): number {
  const explicitos = Number(process.env.BCRYPT_ROUNDS);
  return Number.isInteger(explicitos) && explicitos > 0 ? Math.max(12, explicitos) : 12;
}

// B2: hash ficticio para que el login con un correo inexistente gaste el mismo
// tiempo que uno real (evita enumeración de cuentas por diferencia de respuesta).
let dummyHash: string | null = null;

export function hashDummy(): string {
  if (!dummyHash) {
    dummyHash = bcrypt.hashSync(randomUUID(), redondeosBcrypt());
  }
  return dummyHash;
}