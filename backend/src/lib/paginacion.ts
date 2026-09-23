import type { Request } from "express";

const MAX_POR_PAGINA = 100;
const POR_PAGINA_DEFECTO = 10;

export interface Paginacion {
  pagina: number;
  porPagina: number;
}

export interface RespuestaPaginada<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

function enteroPositivo(valor: unknown, defecto: number): number | undefined {
  if (valor === undefined) return defecto;
  if (typeof valor !== "string") return undefined;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

export function parsearPaginacion(query: Request["query"]): Paginacion | undefined {
  if (query.page === undefined && query.pageSize === undefined) return undefined;
  const pagina = enteroPositivo(query.page, 1);
  const porPagina = enteroPositivo(query.pageSize, POR_PAGINA_DEFECTO);
  if (pagina === undefined || porPagina === undefined) {
    throw new Error("Paginación inválida");
  }
  return { pagina, porPagina: Math.min(porPagina, MAX_POR_PAGINA) };
}

export function respuestaPaginada<T>(items: T[], total: number, page?: number, pageSize?: number): T[] | RespuestaPaginada<T> {
  if (page === undefined || pageSize === undefined) return items;
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}