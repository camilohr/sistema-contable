import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import ComprobanteForm, { type ComprobanteFormData } from "../components/ComprobanteForm";
import AdjuntosLista from "../components/AdjuntosLista";
import { cop } from "../lib/formato";

interface AsientoDet {
  id: number;
  cuentaId: number;
  codigoCuenta?: string;
  nombreCuenta?: string;
  terceroId: string | null;
  tercero?: string;
  debito: number;
  credito: number;
  detalle: string | null;
}

interface Comprobante {
  id: number;
  tipo: "DIARIO" | "INGRESO" | "EGRESO";
  consecutivo: number;
  fecha: string;
  periodoId: number;
  periodo?: { id: number; nombre: string; estado: string };
  terceroId: string | null;
  tercero?: { nombreRazonSocial: string } | null;
  concepto: string;
  totalDebito: number;
  totalCredito: number;
  estado: "BORRADOR" | "CONTABILIZADO" | "ANULADO";
  usuarioAnuloId: string | null;
  fechaAnulacion: string | null;
  numAsientos?: number;
  asientos?: AsientoDet[];
}

interface Periodo {
  id: number;
  nombre: string;
}

const estadoLabel: Record<string, string> = { BORRADOR: "Borrador", CONTABILIZADO: "Contabilizado", ANULADO: "Anulado" };
const tipoLabel: Record<string, string> = { DIARIO: "Diario", INGRESO: "Ingreso", EGRESO: "Egreso" };

const ref = (c: Comprobante) => `${c.tipo[0]}-${String(c.consecutivo).padStart(4, "0")}`;

export default function Comprobantes() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "ADMIN" || usuario?.rol === "CONTADOR";

  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [periodoId, setPeriodoId] = useState("");

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<ComprobanteFormData | null>(null);
  const [detalle, setDetalle] = useState<Comprobante | null>(null);
  const [anulando, setAnulando] = useState<Comprobante | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.set("busqueda", busqueda.trim());
      if (tipo) params.set("tipo", tipo);
      if (estado) params.set("estado", estado);
      if (periodoId) params.set("periodoId", periodoId);
      const res = await api.get<Comprobante[]>(`/comprobantes${params.toString() ? `?${params}` : ""}`);
      setComprobantes(res.data);
    } catch {
      setError("No se pudieron cargar los comprobantes.");
    } finally {
      setCargando(false);
    }
  }, [busqueda, tipo, estado, periodoId]);

  useEffect(() => {
    const t = setTimeout(() => cargar(), busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  useEffect(() => {
    api.get<Periodo[]>("/periodos").then((r) => setPeriodos(r.data)).catch(() => {});
  }, []);

  const recargar = () => {
    setCreando(false);
    setEditando(null);
    setAnulando(null);
    cargar();
  };

  const contabilizar = async (c: Comprobante) => {
    setError("");
    try {
      await api.post(`/comprobantes/${c.id}/contabilizar`);
      cargar();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al contabilizar.");
    }
  };

  const anular = async () => {
    if (!anulando) return;
    setError("");
    try {
      await api.post(`/comprobantes/${anulando.id}/anular`);
      recargar();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al anular.");
    }
  };

  const eliminar = async (c: Comprobante) => {
    setError("");
    try {
      await api.delete(`/comprobantes/${c.id}`);
      cargar();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al eliminar.");
    }
  };

  const verDetalle = async (c: Comprobante) => {
    try {
      const res = await api.get<Comprobante>(`/comprobantes/${c.id}`);
      setDetalle(res.data);
    } catch {
      setError("No se pudo cargar el detalle.");
    }
  };

  const editar = async (c: Comprobante) => {
    try {
      const res = await api.get<Comprobante>(`/comprobantes/${c.id}`);
      const d = res.data;
      setEditando({
        id: d.id,
        tipo: d.tipo,
        fecha: d.fecha.slice(0, 10),
        periodoId: d.periodoId,
        concepto: d.concepto,
        estado: "BORRADOR",
        asientos: (d.asientos ?? []).map((a) => ({
          cuentaId: a.cuentaId,
          terceroId: a.terceroId ?? "",
          debito: a.debito ? String(a.debito) : "",
          credito: a.credito ? String(a.credito) : "",
          detalle: a.detalle ?? "",
        })),
      });
    } catch {
      setError("No se pudo cargar el comprobante.");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Comprobantes</h2>
        {puedeEditar && (
          <button className="btn btn-primary" onClick={() => setCreando(true)}>
            Nuevo comprobante
          </button>
        )}
      </div>

      <div className="filters">
        <input
          className="filter-input"
          type="search"
          placeholder="Buscar por concepto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="filter-input">
          <option value="">Todos los tipos</option>
          {Object.entries(tipoLabel).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="filter-input">
          <option value="">Todos los estados</option>
          {Object.entries(estadoLabel).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)} className="filter-input">
          <option value="">Todos los periodos</option>
          {periodos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && comprobantes.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && comprobantes.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Tercero</th>
                <th>Total</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {comprobantes.map((c) => (
                <tr key={c.id} className={c.estado === "ANULADO" ? "inactiva" : ""}>
                  <td className="codigo-cell">{ref(c)}</td>
                  <td>{c.fecha.slice(0, 10)}</td>
                  <td>{tipoLabel[c.tipo]}</td>
                  <td>{c.concepto}</td>
                  <td>{c.tercero?.nombreRazonSocial ?? "—"}</td>
                  <td className="mono">{cop(c.totalDebito)}</td>
                  <td>
                    <span className={`badge badge-${c.estado === "CONTABILIZADO" ? "mov" : c.estado === "ANULADO" ? "err" : "terc"}`}>
                      {estadoLabel[c.estado]}
                    </span>
                  </td>
                  <td className="acciones">
                    <button className="btn btn-secondary btn-sm" onClick={() => verDetalle(c)}>
                      Ver
                    </button>
                    {puedeEditar && c.estado === "BORRADOR" && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => editar(c)}>
                          Editar
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => contabilizar(c)}>
                          Contabilizar
                        </button>
                        <button className="btn btn-secondary btn-sm btn-danger" onClick={() => eliminar(c)}>
                          Eliminar
                        </button>
                      </>
                    )}
                    {puedeEditar && c.estado === "CONTABILIZADO" && (
                      <button className="btn btn-secondary btn-sm btn-danger" onClick={() => setAnulando(c)}>
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <ComprobanteForm titulo="Nuevo comprobante" onClose={() => setCreando(false)} onGuardado={recargar} />}
      {editando && <ComprobanteForm inicial={editando} titulo="Editar comprobante" onClose={() => setEditando(null)} onGuardado={recargar} />}
      {detalle && <DetalleComprobante comprobante={detalle} onClose={() => setDetalle(null)} />}
      {anulando && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Anular comprobante</h3>
            <p>
              ¿Anular <strong>{ref(anulando)}</strong> ({anulando.concepto})? El comprobante queda anulado y no se contabiliza.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setAnulando(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary btn-danger" onClick={anular}>
                Anular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetalleComprobante({ comprobante: c, onClose }: { comprobante: Comprobante; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h3>
          {ref(c)} — {c.concepto}
        </h3>
        <div className="detalle-grid">
          <span><em>Fecha</em> {c.fecha.slice(0, 10)}</span>
          <span><em>Tipo</em> {tipoLabel[c.tipo]}</span>
          <span><em>Periodo</em> {c.periodo?.nombre}</span>
          <span><em>Estado</em> {estadoLabel[c.estado]}</span>
          <span><em>Tercero</em> {c.tercero?.nombreRazonSocial ?? "—"}</span>
          <span><em>Total</em> {cop(c.totalDebito)}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Tercero</th>
              <th>Débito</th>
              <th>Crédito</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {(c.asientos ?? []).map((a) => (
              <tr key={a.id}>
                <td className="codigo-cell">{a.codigoCuenta} {a.nombreCuenta}</td>
                <td>{a.tercero ?? "—"}</td>
                <td className="mono">{a.debito ? cop(a.debito) : ""}</td>
                <td className="mono">{a.credito ? cop(a.credito) : ""}</td>
                <td>{a.detalle ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <AdjuntosLista entidad="COMPROBANTE" entidadId={String(c.id)} />
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
