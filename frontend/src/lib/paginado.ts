export interface RespuestaPaginada<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function extraerPaginado<T>(data: T[] | RespuestaPaginada<T>): { items: T[]; total: number; pages: number } {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, pages: data.length > 0 ? 1 : 0 };
  }
  return { items: data.items, total: data.total, pages: data.pages };
}