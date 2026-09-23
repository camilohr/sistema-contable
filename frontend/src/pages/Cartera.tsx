import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import { cop } from "../lib/formato";

export type TipoCartera = "cxc" | "cxp";

interface Tercero {
  id: string;
  tipo: "CLIENTE" | "PROVEEDOR" | "AMBOS";
  tipoDocumento: string;
  documento: string;
  nombreRazonSocial: string;
  activo: boolean;
}

interface Abono {
  id: number;
  numero: string;
  fecha: string;
  valor: number;
  formaPago: string;
}

interface DocumentoCartera {
  id: number;
  numeroDocumento: string;
  fechaEmision: string;
  fechaVencimiento: string;
  valor: number;
  saldo: number;
  estado: "PENDIENTE" | "ABONADA" | "CANCELADA" | "VENCIDA";
  tercero: { id: string; nombreRazonSocial: string; documento: string; tipoDocumento: string };
  recibos?: Abono[];
  pagos?: Abono[];
}

const config = {
  cxc: {
    titulo: "Cuentas por cobrar",
    nuevo: "Nueva CxC",
    abonoSingular: "recibo",
    abonoRel: "recibos" as const,
    tipoTercero: ["CLIENTE", "AMBOS"],
  },
  cxp: {
    titulo: "Cuentas por pagar",
    nuevo: "Nueva CxP",
    abonoSingular: "pago",
    abonoRel: "pagos" as const,
    tipoTercero: ["PROVEEDOR", "AMBOS"],
  },
};

const estadoLabel: Record<string, string> = {
  PENDIENTE: "Pendiente",
  ABONADA: "Abonada",
  CANCELADA: "Cancelada",
  VENCIDA: "Vencida",
};

const estadoBadge: Record<string, string> = {
  PENDIENTE: "badge-terc",
  ABONADA: "badge-mov",
  CANCELADA: "badge-mov",
  VENCIDA: "badge-err",
};

const formaLabel: Record<string, string> = {
  EFECTIVO: "Efectivo",
  CHEQUE: "Cheque",
  TRANSFERENCIA: "Transferencia",
};

export default function Cartera({ tipo }: { tipo: TipoCartera }) {
  const { puedeEditar } = useEmpresa();
  const cfg = config[tipo];

  const [docs, setDocs] = useState<DocumentoCartera[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");

  const [creando, setCreando] = useState(false);
  const [detalle, setDetalle] = useState<DocumentoCartera | null>(null);
  const [eliminando, setEliminando] = useState<DocumentoCartera | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.set("busqueda", busqueda.trim());
      if (estado) params.set("estado", estado);
      const res = await api.get<DocumentoCartera[]>(`/${tipo}${params.toString() ? `?${params}` : ""}`);
      setDocs(res.data);
    } catch {
      setError(`No se pudieron cargar las ${cfg.titulo.toLowerCase()}.`);
    } finally {
      setCargando(false);
    }
  }, [tipo, busqueda, estado, cfg.titulo]);

  const cargarTerceros = useCallback(async () => {
    try {
      const res = await api.get<Tercero[]>("/terceros?soloActivos=true");
      setTerceros(res.data.filter((t) => cfg.tipoTercero.includes(t.tipo)));
    } catch {
      setTerceros([]);
    }
  }, [cfg]);

  useEffect(() => {
    const t = setTimeout(() => cargar(), busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  useEffect(() => {
    cargarTerceros();
  }, [cargarTerceros]);

  const totalSaldo = useMemo(() => docs.reduce((s, d) => s + d.saldo, 0), [docs]);
  const totalVencidas = useMemo(() => docs.filter((d) => d.estado === "VENCIDA").length, [docs]);

  const abonosDe = (d: DocumentoCartera): Abono[] => d[cfg.abonoRel] ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{cfg.titulo}</h2>
          <p className="count-hint">Saldos y movimientos por documento.</p>
        </div>
        {puedeEditar && (
          <button className="btn btn-primary" onClick={() => setCreando(true)}>
            {cfg.nuevo}
          </button>
        )}
      </div>

      <div className="filters">
        <input
          className="filter-input"
          type="search"
          placeholder="Buscar número de documento o tercero..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="filter-input">
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="ABONADA">Abonadas</option>
          <option value="CANCELADA">Canceladas</option>
          <option value="VENCIDA">Vencidas</option>
        </select>
      </div>

      {docs.length > 0 && (
        <p className="count-hint">
          {docs.length} documento{docs.length === 1 ? "" : "s"} · Saldo total: <strong>{cop(totalSaldo)}</strong>
          {totalVencidas > 0 && <> · Vencidas: <strong>{totalVencidas}</strong></>}
        </p>
      )}
      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && docs.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && docs.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Tercero</th>
                <th>Emisión</th>
                <th>Vence</th>
                <th className="num-cell">Valor</th>
                <th className="num-cell">Saldo</th>
                <th>Estado</th>
                <th>{cfg.abonoRel === "recibos" ? "Recibos" : "Pagos"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const abonos = abonosDe(d);
                return (
                  <tr key={d.id}>
                    <td className="codigo-cell">{d.numeroDocumento}</td>
                    <td>
                      {d.tercero.nombreRazonSocial}
                      <br />
                      <span className="muted">
                        {d.tercero.tipoDocumento} {d.tercero.documento}
                      </span>
                    </td>
                    <td>{d.fechaEmision.slice(0, 10)}</td>
                    <td>{d.fechaVencimiento.slice(0, 10)}</td>
                    <td className="num-cell">{cop(d.valor)}</td>
                    <td className="num-cell">
                      <strong>{cop(d.saldo)}</strong>
                    </td>
                    <td>
                      <span className={`badge ${estadoBadge[d.estado]}`}>{estadoLabel[d.estado]}</span>
                    </td>
                    <td>{abonos.length > 0 ? abonos.length : "—"}</td>
                    <td className="acciones">
                      <button className="btn btn-secondary btn-sm" onClick={() => setDetalle(d)}>
                        Ver / abonar
                      </button>
                      {puedeEditar && abonos.length === 0 && (
                        <button className="btn btn-secondary btn-sm btn-danger" onClick={() => setEliminando(d)}>
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creando && (
        <FormaNueva
          tipo={tipo}
          terceros={terceros}
          onClose={() => setCreando(false)}
          onCreado={() => { setCreando(false); cargar(); }}
        />
      )}
      {detalle && (
        <DetalleDocumento
          tipo={tipo}
          documento={detalle}
          puedeEditar={puedeEditar}
          onClose={() => setDetalle(null)}
          onActualizado={(actualizado) => {
            setDetalle(actualizado);
            cargar();
          }}
        />
      )}
      {eliminando && (
        <ConfirmarEliminar
          tipo={tipo}
          documento={eliminando}
          onClose={() => setEliminando(null)}
          onHecho={() => { setEliminando(null); cargar(); }}
        />
      )}
    </div>
  );
}

function FormaNueva({ tipo, terceros, onClose, onCreado }: { tipo: TipoCartera; terceros: Tercero[]; onClose: () => void; onCreado: () => void }) {
  const [form, setForm] = useState({
    terceroId: "",
    numeroDocumento: "",
    fechaEmision: new Date().toISOString().slice(0, 10),
    fechaVencimiento: "",
    valor: "",
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const set = (campo: string, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.post(`/${tipo}`, {
        terceroId: form.terceroId,
        numeroDocumento: form.numeroDocumento,
        fechaEmision: form.fechaEmision,
        fechaVencimiento: form.fechaVencimiento,
        valor: Number(form.valor),
      });
      onCreado();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al crear el documento.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{config[tipo].nuevo}</h3>
        <form onSubmit={onSubmit} className="form-card">
          <label>
            Tercero
            <select value={form.terceroId} onChange={(e) => set("terceroId", e.target.value)} required>
              <option value="">Seleccione un tercero...</option>
              {terceros.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombreRazonSocial} · {t.tipoDocumento} {t.documento}
                </option>
              ))}
            </select>
          </label>
          <label>
            Número de documento
            <input value={form.numeroDocumento} onChange={(e) => set("numeroDocumento", e.target.value)} required placeholder="F-001" />
          </label>
          <div className="form-row">
            <label>
              Fecha de emisión
              <input type="date" value={form.fechaEmision} onChange={(e) => set("fechaEmision", e.target.value)} required />
            </label>
            <label>
              Fecha de vencimiento
              <input type="date" value={form.fechaVencimiento} onChange={(e) => set("fechaVencimiento", e.target.value)} required />
            </label>
          </div>
          <label>
            Valor
            <input type="number" min="0.01" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} required />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? "Creando..." : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetalleDocumento({
  tipo,
  documento,
  puedeEditar,
  onClose,
  onActualizado,
}: {
  tipo: TipoCartera;
  documento: DocumentoCartera;
  puedeEditar: boolean;
  onClose: () => void;
  onActualizado: (d: DocumentoCartera) => void;
}) {
  const cfg = config[tipo];
  const abonos = documento[cfg.abonoRel] ?? [];

  const [form, setForm] = useState({
    valor: "",
    formaPago: "EFECTIVO",
    fecha: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const abonar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const res = await api.post<{ documento: DocumentoCartera }>(`/${tipo}/${documento.id}/${tipo === "cxc" ? "recibos" : "pagos"}`, {
        valor: Number(form.valor),
        formaPago: form.formaPago,
        fecha: form.fecha,
      });
      onActualizado(res.data.documento);
      setForm({ valor: "", formaPago: "EFECTIVO", fecha: new Date().toISOString().slice(0, 10) });
      setEnviando(false);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al registrar el abono.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h3>
          {documento.numeroDocumento}{" "}
          <span className={`badge ${estadoBadge[documento.estado]}`}>{estadoLabel[documento.estado]}</span>
        </h3>
        <div className="detail-grid">
          <span>
            <em>Tercero</em> {documento.tercero.nombreRazonSocial}
          </span>
          <span>
            <em>Emisión</em> {documento.fechaEmision.slice(0, 10)}
          </span>
          <span>
            <em>Vence</em> {documento.fechaVencimiento.slice(0, 10)}
          </span>
          <span>
            <em>Valor</em> {cop(documento.valor)}
          </span>
          <span>
            <em>Saldo</em> <strong>{cop(documento.saldo)}</strong>
          </span>
        </div>

        <h4>Abonos ({abonos.length})</h4>
        {abonos.length === 0 ? (
          <p className="count-hint">Sin abonos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th className="num-cell">Valor</th>
                  <th>Forma de pago</th>
                </tr>
              </thead>
              <tbody>
                {abonos.map((a) => (
                  <tr key={a.id}>
                    <td className="codigo-cell">{a.numero}</td>
                    <td>{a.fecha.slice(0, 10)}</td>
                    <td className="num-cell">{cop(a.valor)}</td>
                    <td>{formaLabel[a.formaPago] ?? a.formaPago}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {puedeEditar && documento.saldo > 0 && (
          <>
            <h4>Registrar {cfg.abonoSingular}</h4>
            <form onSubmit={abonar} className="form-card">
              <div className="form-row">
                <label>
                  Valor
                  <input type="number" min="0.01" max={documento.saldo} step="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} required />
                </label>
                <label>
                  Forma de pago
                  <select value={form.formaPago} onChange={(e) => setForm((f) => ({ ...f, formaPago: e.target.value }))}>
                    {Object.entries(formaLabel).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha
                  <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
                </label>
              </div>
              {error && <p className="error-msg">{error}</p>}
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  {enviando ? "Registrando..." : `Registrar ${cfg.abonoSingular}`}
                </button>
              </div>
            </form>
          </>
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

function ConfirmarEliminar({ tipo, documento, onClose, onHecho }: { tipo: TipoCartera; documento: DocumentoCartera; onClose: () => void; onHecho: () => void }) {
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const eliminar = async () => {
    setError("");
    setEnviando(true);
    try {
      await api.delete(`/${tipo}/${documento.id}`);
      onHecho();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al eliminar el documento.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Eliminar documento</h3>
        <p>
          ¿Eliminar <strong>{documento.numeroDocumento}</strong> de{" "}
          <strong>{documento.tercero.nombreRazonSocial}</strong>?
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
