interface Props {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  onCambiarPagina: (page: number) => void;
  onCambiarPageSize?: (pageSize: number) => void;
  etiqueta?: string;
}

const OPCIONES_PAGE_SIZE = [10, 25, 50, 100];

export default function Paginador({ page, pageSize, total, pages, onCambiarPagina, onCambiarPageSize, etiqueta = "ítems" }: Props) {
  if (total === 0) return null;
  const desde = (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  return (
    <div className="paginador">
      <p className="count-hint">
        {desde}–{hasta} de {total} {etiqueta} · Página {page} de {pages}
      </p>
      <div className="paginador-controles">
        {onCambiarPageSize && (
          <select
            className="filter-input"
            value={pageSize}
            onChange={(e) => onCambiarPageSize(Number(e.target.value))}
            aria-label="Ítems por página"
          >
            {OPCIONES_PAGE_SIZE.map((n) => (
              <option key={n} value={n}>
                {n} / pág.
              </option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onCambiarPagina(page - 1)}>
          Anterior
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onCambiarPagina(page + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}