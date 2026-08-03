export const NATURALEZA_POR_CLASE: Record<number, "DEUDORA" | "ACREEDORA"> = {
  1: "DEUDORA",
  2: "ACREEDORA",
  3: "ACREEDORA",
  4: "ACREEDORA",
  5: "DEUDORA",
  6: "DEUDORA",
  7: "DEUDORA",
  8: "DEUDORA",
  9: "ACREEDORA",
};

export function nivelDeCodigo(codigo: string): number {
  const len = codigo.length;
  if (len === 1) return 1;
  if (len === 2) return 2;
  if (len === 4) return 3;
  if (len === 6) return 4;
  if (len === 8) return 5;
  throw new Error(`Código PUC inválido: ${codigo}`);
}

export function derivarPuc(codigo: string) {
  const nivel = nivelDeCodigo(codigo);
  const clase = parseInt(codigo[0], 10);
  return {
    nivel,
    clase,
    grupo: nivel >= 2 ? parseInt(codigo.slice(0, 2), 10) : null,
    cuenta: nivel >= 3 ? parseInt(codigo.slice(0, 4), 10) : null,
    subcuenta: nivel >= 4 ? parseInt(codigo.slice(0, 6), 10) : null,
    naturaleza: NATURALEZA_POR_CLASE[clase],
    afectaResultado: [4, 5, 6, 7].includes(clase),
  };
}
