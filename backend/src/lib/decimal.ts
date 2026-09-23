import { Prisma } from "@prisma/client";

export const redondear2 = (n: number): number => Math.round(n * 100) / 100;

export type DecimalInput = Prisma.Decimal | number | null | undefined | { toNumber(): number };

export function num(x: DecimalInput): number {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  return x.toNumber();
}