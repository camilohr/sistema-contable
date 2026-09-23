import { useCallback, useEffect, useState } from "react";
import { Ban, BookCheck, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import ComprobanteForm, { type ComprobanteFormData } from "../components/ComprobanteForm";
import AdjuntosLista from "../components/AdjuntosLista";
import { Badge, Button, Modal, Table } from "../components/ui";
import type { Column } from "../components/ui";
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

const estadoTone: Record<string, "mov" | "err" | "terc"> = {
  CONTABILIZADO: "mov",
  ANULADO: "err",
  BORRADOR: "terc",
};

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

  const columnas: Column<Comprobante>[] = [
    { key: "ref", header: "No.", mono: true, render: (c) => ref(c) },
    { key: "fecha", header: "Fecha", mono: true, render: (c) => c.fecha.slice(0, 10) },
    { key: "tipo", header: "Tipo", render: (c) => tipoLabel[c.tipo] },
    { key: "concepto", header: "Concepto", render: (c) => c.concepto },
    { key: "tercero", header: "Tercero", render: (c) => c.tercero?.nombreRazonSocial ?? "—" },
    { key: "total", header: "Total", align: "right", mono: true, render: (c) => cop(c.totalDebito) },
    {
      key: "estado",
      header: "Estado",
      render: (c) => <Badge tone={estadoTone[c.estado]}>{estadoLabel[c.estado]}</Badge>,
    },
    {
      key: "acciones",
      header: "",
      align: "right",
      render: (c) => (
        <div className="acciones">
          <Button size="sm" variant="secondary" onClick={() => verDetalle(c)}>
            <Eye size={14} />
            Ver
          </Button>
          {puedeEditar && c.estado === "BORRADOR" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => editar(c)}>
                <Pencil size={14} />
                Editar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => contabilizar(c)}>
                <BookCheck size={14} />
                Contabilizar
              </Button>
              <Button size="sm" variant="danger" onClick={() => eliminar(c)}>
                <Trash2 size={14} />
                Eliminar
              </Button>
            </>
          )}
          {puedeEditar && c.estado === "CONTABILIZADO" && (
            <Button size="sm" variant="danger" onClick={() => setAnulando(c)}>
              <Ban size={14} />
              Anular
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Comprobantes</h2>
          <p className="count-hint">Registro de asientos contables con partida doble.</p>
        </div>
        {puedeEditar && (
          <Button onClick={() => setCreando(true)}>
            <Plus size={16} />
            Nuevo comprobante
          </Button>
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
        <Table
          columns={columnas}
          rows={comprobantes}
          keyOf={(c) => String(c.id)}
          empty="Sin resultados."
        />
      )}

      {creando && <ComprobanteForm titulo="Nuevo comprobante" onClose={() => setCreando(false)} onGuardado={recargar} />}
      {editando && <ComprobanteForm inicial={editando} titulo="Editar comprobante" onClose={() => setEditando(null)} onGuardado={recargar} />}
      {detalle && <DetalleComprobante comprobante={detalle} onClose={() => setDetalle(null)} />}
      <Modal open={!!anulando} title="Anular comprobante" onClose={() => setAnulando(null)}>
        {anulando && (
          <>
            <p>
              ¿Anular <strong>{ref(anulando)}</strong> ({anulando.concepto})? El comprobante queda anulado y no se
              contabiliza.
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setAnulando(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={anular}>
                Anular
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function DetalleComprobante({ comprobante: c, onClose }: { comprobante: Comprobante; onClose: () => void }) {
  const asientos = c.asientos ?? [];
  const totDeb = asientos.reduce((s, a) => s + (a.debito || 0), 0);
  const totCred = asientos.reduce((s, a) => s + (a.credito || 0), 0);

  const columnasDet: Column<AsientoDet>[] = [
    {
      key: "cuenta",
      header: "Cuenta",
      mono: true,
      render: (a) => (
        <span>
          <strong>{a.codigoCuenta}</strong> {a.nombreCuenta}
        </span>
      ),
    },
    { key: "tercero", header: "Tercero", render: (a) => a.tercero ?? "—" },
    { key: "debito", header: "Débito", align: "right", mono: true, render: (a) => (a.debito ? cop(a.debito) : "") },
    { key: "credito", header: "Crédito", align: "right", mono: true, render: (a) => (a.credito ? cop(a.credito) : "") },
    { key: "detalle", header: "Detalle", render: (a) => a.detalle ?? "" },
  ];

  return (
    <Modal open title={`${ref(c)} — ${c.concepto}`} onClose={onClose} wide>
      <div className="detalle-grid">
        <span><em>Fecha</em> {c.fecha.slice(0, 10)}</span>
        <span><em>Tipo</em> {tipoLabel[c.tipo]}</span>
        <span><em>Periodo</em> {c.periodo?.nombre}</span>
        <span><em>Estado</em> {estadoLabel[c.estado]}</span>
        <span><em>Tercero</em> {c.tercero?.nombreRazonSocial ?? "—"}</span>
        <span><em>Total</em> {cop(c.totalDebito)}</span>
      </div>
      <Table
        columns={columnasDet}
        rows={asientos}
        keyOf={(a) => String(a.id)}
        empty="Sin asientos"
        footer={
          <tr>
            <td colSpan={2}>Totales</td>
            <td className="num-cell">{cop(totDeb)}</td>
            <td className="num-cell">{cop(totCred)}</td>
            <td></td>
          </tr>
        }
      />
      <div style={{ marginTop: "1rem" }}>
        <AdjuntosLista entidad="COMPROBANTE" entidadId={String(c.id)} />
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
