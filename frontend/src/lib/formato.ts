export const cop = (n: number): string =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
