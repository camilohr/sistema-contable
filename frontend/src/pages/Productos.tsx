import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import { cop } from "../lib/formato";
import { extraerPaginado, type RespuestaPaginada } from "../lib/paginado";
import Paginador from "../components/Paginador";

interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string | null;
  unidad: string;
  costoPromedio: number;
  cantidadActual: number;
  activo: boolean;
  _count?: { movimientos: number };
}

interface Movimiento {
  id: number;
  tipo: "ENTRADA" | "SALIDA";
  cantidad: number;
  costoUnitario: number;
  fecha: string;
  comprobante: { id: number; tipo: string; consecutivo: number; concepto: string } | null;
}

const tipoLabel: Record<string, string> = { ENTRADA: "Entrada", SALIDA: "Salida" };

export default function Productos() {
  const { puedeEditar } = useEmpresa();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [detalle, setDetalle] = useState<Producto | null>(null);
  const [eliminando, setEliminando] = useState<Producto | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.set("busqueda", busqueda.trim());
      if (soloActivos) params.set("soloActivos", "true");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await api.get<Producto[] | RespuestaPaginada<Producto>>(`/productos?${params}`);
      const resultado = extraerPaginado(res.data);
      setProductos(resultado.items);
      setTotal(resultado.total);
      setPages(resultado.pages);
    } catch {
      setError("No se pudieron cargar los productos.");
    } finally {
      setCargando(false);
    }
  }, [busqueda, soloActivos, page, pageSize]);

  useEffect(() => {
    const t = setTimeout(() => cargar(), busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  const valorInventario = useMemo(() => productos.reduce((s, p) => s + p.cantidadActual * p.costoPromedio, 0), [productos]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Productos e inventario</h2>
          <p className="count-hint">Catálogo de productos y existencias en bodega.</p>
        </div>
        {puedeEditar && (
          <button className="btn btn-primary" onClick={() => setCreando(true)}>
            Nuevo producto
          </button>
        )}
      </div>

      <div className="filters">
        <input
          className="filter-input"
          type="search"
          placeholder="Buscar código o nombre..."
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPage(1);
          }}
        />
        <label className="filter-check">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => {
              setSoloActivos(e.target.checked);
              setPage(1);
            }}
          />
          Solo activos
        </label>
      </div>

      {total > 0 && (
        <p className="count-hint">
          {total} producto{total === 1 ? "" : "s"} · Valor del inventario: <strong>{cop(valorInventario)}</strong>
        </p>
      )}
      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && productos.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && total > 0 && (
        <Paginador
          page={page}
          pageSize={pageSize}
          total={total}
          pages={pages}
          onCambiarPagina={setPage}
          onCambiarPageSize={(ps) => {
            setPageSize(ps);
            setPage(1);
          }}
          etiqueta="productos"
        />
      )}

      {!cargando && productos.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th className="num-cell">Stock</th>
                <th className="num-cell">Costo promedio</th>
                <th className="num-cell">Valor inventario</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id} className={!p.activo ? "inactiva" : ""}>
                  <td className="codigo-cell">{p.codigo}</td>
                  <td>{p.nombre}</td>
                  <td>{p.categoria ?? "—"}</td>
                  <td className="num-cell">
                    {p.cantidadActual} <span className="muted">{p.unidad}</span>
                  </td>
                  <td className="num-cell">{cop(p.costoPromedio)}</td>
                  <td className="num-cell">
                    <strong>{cop(p.cantidadActual * p.costoPromedio)}</strong>
                  </td>
                  <td>
                    {p.activo ? (
                      <span className="badge badge-mov">Activo</span>
                    ) : (
                      <span className="badge badge-err">Inactivo</span>
                    )}
                  </td>
                  <td className="acciones">
                    <button className="btn btn-secondary btn-sm" onClick={() => setDetalle(p)}>
                      Kardex
                    </button>
                    {puedeEditar && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditando(p)}>
                          Editar
                        </button>
                        {p.activo && (
                          <button className="btn btn-secondary btn-sm btn-danger" onClick={() => setEliminando(p)}>
                            Eliminar
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && total > 0 && (
        <Paginador
          page={page}
          pageSize={pageSize}
          total={total}
          pages={pages}
          onCambiarPagina={setPage}
          onCambiarPageSize={(ps) => {
            setPageSize(ps);
            setPage(1);
          }}
          etiqueta="productos"
        />
      )}

      {creando && <FormaProducto onClose={() => setCreando(false)} onGuardado={() => { setCreando(false); cargar(); }} />}
      {editando && (
        <FormaProducto
          producto={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar(); }}
        />
      )}
      {detalle && (
        <Kardex
          producto={detalle}
          puedeEditar={puedeEditar}
          onClose={() => setDetalle(null)}
          onMovimiento={(p) => {
            setDetalle(p);
            cargar();
          }}
        />
      )}
      {eliminando && (
        <ConfirmarEliminar producto={eliminando} onClose={() => setEliminando(null)} onHecho={() => { setEliminando(null); cargar(); }} />
      )}
    </div>
  );
}

function FormaProducto({ producto, onClose, onGuardado }: { producto?: Producto; onClose: () => void; onGuardado: () => void }) {
  const [form, setForm] = useState({
    codigo: producto?.codigo ?? "",
    nombre: producto?.nombre ?? "",
    categoria: producto?.categoria ?? "",
    unidad: producto?.unidad ?? "und",
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const set = (campo: string, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const body = {
        ...form,
        categoria: form.categoria || null,
      };
      if (producto) {
        await api.patch(`/productos/${producto.id}`, body);
      } else {
        await api.post("/productos", body);
      }
      onGuardado();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar el producto.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{producto ? `Editar producto ${producto.codigo}` : "Nuevo producto"}</h3>
        <form onSubmit={onSubmit} className="form-card">
          <div className="form-row">
            <label>
              Código
              <input value={form.codigo} onChange={(e) => set("codigo", e.target.value)} required placeholder="P-001" />
            </label>
            <label>
              Unidad
              <input value={form.unidad} onChange={(e) => set("unidad", e.target.value)} required placeholder="und" />
            </label>
          </div>
          <label>
            Nombre
            <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
          </label>
          <label>
            Categoría
            <input value={form.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="Mercancías" />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Kardex({ producto, puedeEditar, onClose, onMovimiento }: { producto: Producto; puedeEditar: boolean; onClose: () => void; onMovimiento: (p: Producto) => void }) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    tipo: "ENTRADA",
    cantidad: "",
    costoUnitario: "",
    fecha: new Date().toISOString().slice(0, 10),
  });
  const [enviando, setEnviando] = useState(false);

  const cargarMovimientos = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await api.get<{ producto: Producto; movimientos: Movimiento[] }>(`/productos/${producto.id}/movimientos`);
      setMovimientos(res.data.movimientos);
      onMovimiento(res.data.producto);
    } catch {
      setError("No se pudieron cargar los movimientos.");
    } finally {
      setCargando(false);
    }
  }, [producto.id, onMovimiento]);

  useEffect(() => {
    cargarMovimientos();
  }, [cargarMovimientos]);

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const body = {
        tipo: form.tipo,
        cantidad: Number(form.cantidad),
        costoUnitario: Number(form.costoUnitario),
        fecha: form.fecha,
      };
      const res = await api.post<{ actualizado: Producto }>(`/productos/${producto.id}/movimientos`, body);
      setForm((f) => ({ ...f, cantidad: "", costoUnitario: "" }));
      onMovimiento(res.data.actualizado);
      await cargarMovimientos();
      setEnviando(false);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al registrar el movimiento.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h3>
          Kardex · {producto.nombre} <span className="muted">{producto.codigo}</span>
        </h3>
        <div className="detail-grid">
          <span>
            <em>Stock actual</em> {producto.cantidadActual} {producto.unidad}
          </span>
          <span>
            <em>Costo promedio</em> {cop(producto.costoPromedio)}
          </span>
          <span>
            <em>Valor inventario</em> {cop(producto.cantidadActual * producto.costoPromedio)}
          </span>
        </div>

        {puedeEditar && (
          <form onSubmit={registrar} className="form-card">
            <div className="form-row">
              <label>
                Tipo
                <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="ENTRADA">Entrada</option>
                  <option value="SALIDA">Salida</option>
                </select>
              </label>
              <label>
                Cantidad
                <input type="number" min="0.0001" step="any" value={form.cantidad} onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} required />
              </label>
              <label>
                Costo unitario
                <input type="number" min="0" step="0.01" value={form.costoUnitario} onChange={(e) => setForm((f) => ({ ...f, costoUnitario: e.target.value }))} required />
              </label>
              <label>
                Fecha
                <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
              </label>
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div className="modal-actions">
              <button type="submit" className="btn btn-primary" disabled={enviando}>
                {enviando ? "Registrando..." : "Registrar movimiento"}
              </button>
            </div>
          </form>
        )}

        <h4>Movimientos ({movimientos.length})</h4>
        {cargando ? (
          <p className="count-hint">Cargando...</p>
        ) : movimientos.length === 0 ? (
          <p className="count-hint">Sin movimientos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th className="num-cell">Cantidad</th>
                  <th className="num-cell">Costo unitario</th>
                  <th className="num-cell">Total</th>
                  <th>Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>{m.fecha.slice(0, 10)}</td>
                    <td>
                      <span className={`badge ${m.tipo === "ENTRADA" ? "badge-mov" : "badge-err"}`}>{tipoLabel[m.tipo]}</span>
                    </td>
                    <td className="num-cell">{m.cantidad}</td>
                    <td className="num-cell">{cop(m.costoUnitario)}</td>
                    <td className="num-cell">{cop(m.cantidad * m.costoUnitario)}</td>
                    <td>{m.comprobante ? `${m.comprobante.tipo} ${m.comprobante.consecutivo}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmarEliminar({ producto, onClose, onHecho }: { producto: Producto; onClose: () => void; onHecho: () => void }) {
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const eliminar = async () => {
    setError("");
    setEnviando(true);
    try {
      await api.delete(`/productos/${producto.id}`);
      onHecho();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al eliminar el producto.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Eliminar producto</h3>
        <p>
          ¿Eliminar <strong>{producto.nombre}</strong> ({producto.codigo})? Si tiene movimientos se desactivará conservando su historial.
        </p>
        {error && <p className="error-msg">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-danger" onClick={eliminar} disabled={enviando}>
            {enviando ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
