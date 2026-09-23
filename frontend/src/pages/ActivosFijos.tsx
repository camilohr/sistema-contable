import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import { cop } from "../lib/formato";
import { extraerPaginado, type RespuestaPaginada } from "../lib/paginado";
import Paginador from "../components/Paginador";

interface Activo {
  id: number;
  cuentaId: number;
  codigoCuenta: string;
  nombreCuenta: string;
  cuentaDepreciacionId: number;
  codigoCuentaDepreciacion: string;
  cuentaGastoId: number;
  codigoCuentaGasto: string;
  nombre: string;
  fechaAdquisicion: string;
  valor: number;
  vidaUtilMeses: number;
  valorResidual: number;
  metodo: "LINEA_RECTA";
  depreciacionAcumulada: number;
  estado: "ACTIVO" | "DEPRECIADO_TOTAL" | "DADO_DE_BAJA";
  numDepreciaciones: number;
}

interface Periodo {
  id: number;
  nombre: string;
  estado: "ABIERTO" | "CERRADO";
}

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
}

interface Depreciacion {
  id: number;
  periodoId: number;
  periodo: string;
  comprobanteId: number | null;
  valor: number;
  createdAt: string;
}

const estadoLabel: Record<string, string> = {
  ACTIVO: "Activo",
  DEPRECIADO_TOTAL: "Depreciado total",
  DADO_DE_BAJA: "Dado de baja",
};

const estadoBadge: Record<string, string> = {
  ACTIVO: "badge-mov",
  DEPRECIADO_TOTAL: "badge-warn",
  DADO_DE_BAJA: "badge-err",
};

export default function ActivosFijos() {
  const { puedeEditar } = useEmpresa();

  const [activos, setActivos] = useState<Activo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Activo | null>(null);
  const [historial, setHistorial] = useState<Activo | null>(null);
  const [bajando, setBajando] = useState<Activo | null>(null);
  const [depreciando, setDepreciando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (estado) params.set("estado", estado);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await api.get<Activo[] | RespuestaPaginada<Activo>>(`/activos-fijos?${params}`);
      const resultado = extraerPaginado(res.data);
      setActivos(resultado.items);
      setTotal(resultado.total);
      setPages(resultado.pages);
    } catch {
      setError("No se pudieron cargar los activos fijos.");
    } finally {
      setCargando(false);
    }
  }, [estado, page, pageSize]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const valorEnLibros = useMemo(
    () => activos.reduce((s, a) => s + (a.estado !== "DADO_DE_BAJA" ? a.valor - a.depreciacionAcumulada : 0), 0),
    [activos]
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Activos fijos</h2>
          <p className="count-hint">Registro, depreciación y baja de activos fijos.</p>
        </div>
        <div>
          {puedeEditar && (
            <>
              <button className="btn btn-secondary" onClick={() => setDepreciando(true)}>
                Depreciar periodo
              </button>{" "}
              <button className="btn btn-primary" onClick={() => setCreando(true)}>
                Nuevo activo
              </button>
            </>
          )}
        </div>
      </div>

      <div className="filters">
        <select
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            setPage(1);
          }}
          className="filter-input"
        >
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activo</option>
          <option value="DEPRECIADO_TOTAL">Depreciado total</option>
          <option value="DADO_DE_BAJA">Dado de baja</option>
        </select>
      </div>

      {total > 0 && (
        <p className="count-hint">
          {total} activo{total === 1 ? "" : "s"} · Valor en libros: <strong>{cop(valorEnLibros)}</strong>
        </p>
      )}
      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && activos.length === 0 && <p className="count-hint">Sin resultados.</p>}

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
          etiqueta="activos"
        />
      )}

      {!cargando && activos.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Activo</th>
                <th>Cuenta</th>
                <th>Adquisición</th>
                <th className="num-cell">Valor</th>
                <th className="num-cell">Vida útil</th>
                <th className="num-cell">Dep. acumulada</th>
                <th className="num-cell">Valor en libros</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activos.map((a) => (
                <tr key={a.id} className={a.estado === "DADO_DE_BAJA" ? "inactiva" : ""}>
                  <td>{a.nombre}</td>
                  <td className="codigo-cell">{a.codigoCuenta}</td>
                  <td className="mono">{a.fechaAdquisicion}</td>
                  <td className="num-cell">{cop(a.valor)}</td>
                  <td className="num-cell">{a.vidaUtilMeses} meses</td>
                  <td className="num-cell">{cop(a.depreciacionAcumulada)}</td>
                  <td className="num-cell">
                    <strong>{cop(a.valor - a.depreciacionAcumulada)}</strong>
                  </td>
                  <td>
                    <span className={`badge ${estadoBadge[a.estado]}`}>{estadoLabel[a.estado]}</span>
                  </td>
                  <td className="acciones">
                    <button className="btn btn-secondary btn-sm" onClick={() => setHistorial(a)}>
                      Historial
                    </button>
                    {puedeEditar && a.estado !== "DADO_DE_BAJA" && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditando(a)}>
                          Editar
                        </button>
                        <button className="btn btn-secondary btn-sm btn-danger" onClick={() => setBajando(a)}>
                          Dar de baja
                        </button>
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
          etiqueta="activos"
        />
      )}

      {creando && (
        <FormaActivo onClose={() => setCreando(false)} onGuardado={() => { setCreando(false); cargar(); }} />
      )}
      {editando && (
        <FormaActivo
          activo={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar(); }}
        />
      )}
      {historial && <Historial activo={historial} onClose={() => setHistorial(null)} />}
      {bajando && (
        <FormaBaja
          activo={bajando}
          onClose={() => setBajando(null)}
          onHecho={() => { setBajando(null); cargar(); }}
        />
      )}
      {depreciando && (
        <FormaDepreciar
          onClose={() => { setDepreciando(false); cargar(); }}
        />
      )}
    </div>
  );
}

function FormaActivo({ activo, onClose, onGuardado }: { activo?: Activo; onClose: () => void; onGuardado: () => void }) {
  const [form, setForm] = useState({
    nombre: activo?.nombre ?? "",
    fechaAdquisicion: activo?.fechaAdquisicion ?? new Date().toISOString().slice(0, 10),
    valor: activo ? String(activo.valor) : "",
    vidaUtilMeses: activo ? String(activo.vidaUtilMeses) : "",
    valorResidual: activo ? String(activo.valorResidual) : "0",
    cuentaId: activo ? String(activo.cuentaId) : "",
    cuentaDepreciacionId: activo ? String(activo.cuentaDepreciacionId) : "",
    cuentaGastoId: activo ? String(activo.cuentaGastoId) : "",
  });
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<Cuenta[]>("/cuentas?soloMovimiento=true").then((r) => setCuentas(r.data)).catch(() => setError("No se pudieron cargar las cuentas."));
  }, []);

  const set = (campo: string, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const filtradas = (pred: (c: Cuenta) => boolean) => cuentas.filter(pred).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const cuentasActivo = filtradas((c) => c.codigo.startsWith("15"));
  const cuentasAcumulada = filtradas((c) => c.codigo.startsWith("159"));
  const cuentasGasto = filtradas((c) => c.codigo.startsWith("516") || c.codigo.startsWith("526"));

  const SelectCuenta = ({ label, campo, opciones }: { label: string; campo: "cuentaId" | "cuentaDepreciacionId" | "cuentaGastoId"; opciones: Cuenta[] }) => (
    <label>
      {label}<span className="req">*</span>
      <select value={form[campo]} onChange={(e) => set(campo, e.target.value)} required>
        <option value="">Seleccione...</option>
        {opciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} - {c.nombre}
          </option>
        ))}
      </select>
    </label>
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const body = {
        nombre: form.nombre,
        fechaAdquisicion: form.fechaAdquisicion,
        valor: Number(form.valor),
        vidaUtilMeses: Number(form.vidaUtilMeses),
        valorResidual: Number(form.valorResidual || 0),
        cuentaId: Number(form.cuentaId),
        cuentaDepreciacionId: Number(form.cuentaDepreciacionId),
        cuentaGastoId: Number(form.cuentaGastoId),
      };
      if (activo) {
        await api.patch(`/activos-fijos/${activo.id}`, { nombre: form.nombre });
      } else {
        await api.post("/activos-fijos", body);
      }
      onGuardado();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar el activo.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h3>{activo ? `Editar activo ${activo.nombre}` : "Nuevo activo fijo"}</h3>
        <form onSubmit={onSubmit} className="form-card">
          {!activo && (
            <>
              <div className="form-row">
                <SelectCuenta label="Cuenta del activo (grupo 15)" campo="cuentaId" opciones={cuentasActivo} />
                <SelectCuenta label="Depreciación acumulada (159)" campo="cuentaDepreciacionId" opciones={cuentasAcumulada} />
                <SelectCuenta label="Gasto por depreciación (516/526)" campo="cuentaGastoId" opciones={cuentasGasto} />
              </div>
              <div className="form-row">
                <label>
                  Valor<span className="req">*</span>
                  <input type="number" min="0.01" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} required />
                </label>
                <label>
                  Vida útil (meses)<span className="req">*</span>
                  <input type="number" min="1" step="1" value={form.vidaUtilMeses} onChange={(e) => set("vidaUtilMeses", e.target.value)} required />
                </label>
                <label>
                  Valor residual
                  <input type="number" min="0" step="0.01" value={form.valorResidual} onChange={(e) => set("valorResidual", e.target.value)} />
                </label>
              </div>
              <label>
                Fecha de adquisición<span className="req">*</span>
                <input type="date" value={form.fechaAdquisicion} onChange={(e) => set("fechaAdquisicion", e.target.value)} required />
              </label>
            </>
          )}
          <label>
            Nombre<span className="req">*</span>
            <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
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

function FormaDepreciar({ onClose }: { onClose: () => void }) {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoId, setPeriodoId] = useState("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<{ procesados: number; comprobante: { consecutivo: number; totalDebito: number; estado: string } } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    api.get<Periodo[]>("/periodos").then((r) => setPeriodos(r.data.filter((p) => p.estado === "ABIERTO"))).catch(() => setError("No se pudieron cargar los periodos."));
  }, []);

  const ejecutar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const res = await api.post(`/activos-fijos/depreciar/${periodoId}`);
      setResultado(res.data);
      setMensaje("Depreciación calculada en borrador; debe contabilizarse por un segundo revisor.");
      setEnviando(false);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al depreciar el periodo.");
      setEnviando(false);
    }
  };

  const contabilizar = async () => {
    if (!resultado) return;
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      await api.post(`/activos-fijos/depreciar/${periodoId}/contabilizar`);
      setMensaje("Depreciación contabilizada.");
      setResultado(null);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al contabilizar la depreciación.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Depreciar periodo</h3>
        <form onSubmit={ejecutar} className="form-card">
          <label>
            Periodo (abierto)
            <select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)} required>
              <option value="">Seleccione...</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          {resultado && (
            <p className="count-hint">
              {resultado.procesados} activo{resultado.procesados === 1 ? "" : "s"} depreciado
              {resultado.procesados === 1 ? "" : "s"} · Comprobante DIARIO {resultado.comprobante.consecutivo} por {cop(resultado.comprobante.totalDebito)} · {resultado.comprobante.estado}.
            </p>
          )}
          {mensaje && <p className="success-msg">{mensaje}</p>}
          {error && <p className="error-msg">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cerrar
            </button>
            {resultado?.comprobante?.estado === "BORRADOR" && (
              <button type="button" className="btn btn-primary" onClick={contabilizar} disabled={enviando}>
                {enviando ? "Contabilizando..." : "Contabilizar"}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={enviando || !periodoId}>
              {enviando ? "Depreciando..." : "Depreciar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormaBaja({ activo, onClose, onHecho }: { activo: Activo; onClose: () => void; onHecho: () => void }) {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [form, setForm] = useState({
    periodoId: "",
    fecha: new Date().toISOString().slice(0, 10),
    concepto: `Baja ${activo.nombre}`,
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<Periodo[]>("/periodos").then((r) => setPeriodos(r.data.filter((p) => p.estado === "ABIERTO"))).catch(() => setError("No se pudieron cargar los periodos."));
  }, []);

  const set = (campo: string, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const ejecutar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.post(`/activos-fijos/${activo.id}/baja`, {
        periodoId: Number(form.periodoId),
        fecha: form.fecha,
        concepto: form.concepto,
      });
      onHecho();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al dar de baja el activo.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Dar de baja {activo.nombre}</h3>
        <form onSubmit={ejecutar} className="form-card">
          <label>
            Periodo (abierto)
            <select value={form.periodoId} onChange={(e) => set("periodoId", e.target.value)} required>
              <option value="">Seleccione...</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Fecha
              <input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} required />
            </label>
            <label>
              Concepto
              <input value={form.concepto} onChange={(e) => set("concepto", e.target.value)} required />
            </label>
          </div>
          <p className="count-hint">
            Valor en libros por retirar: <strong>{cop(activo.valor - activo.depreciacionAcumulada)}</strong>
          </p>
          {error && <p className="error-msg">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-danger" disabled={enviando || !form.periodoId}>
              {enviando ? "Procesando..." : "Dar de baja"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Historial({ activo, onClose }: { activo: Activo; onClose: () => void }) {
  const [depreciaciones, setDepreciaciones] = useState<Depreciacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Depreciacion[]>(`/activos-fijos/${activo.id}/depreciaciones`)
      .then((r) => setDepreciaciones(r.data))
      .catch(() => setError("No se pudieron cargar las depreciaciones."))
      .finally(() => setCargando(false));
  }, [activo.id]);

  const total = depreciaciones.reduce((s, d) => s + d.valor, 0);

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h3>
          Historial · {activo.nombre} <span className="muted">{activo.codigoCuenta}</span>
        </h3>
        <div className="detail-grid">
          <span>
            <em>Valor</em> {cop(activo.valor)}
          </span>
          <span>
            <em>Vida útil</em> {activo.vidaUtilMeses} meses
          </span>
          <span>
            <em>Dep. acumulada</em> {cop(activo.depreciacionAcumulada)}
          </span>
          <span>
            <em>Valor en libros</em> {cop(activo.valor - activo.depreciacionAcumulada)}
          </span>
        </div>
        {error ? (
          <p className="error-msg">{error}</p>
        ) : cargando ? (
          <p className="count-hint">Cargando...</p>
        ) : depreciaciones.length === 0 ? (
          <p className="count-hint">Sin depreciaciones registradas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th className="num-cell">Valor</th>
                  <th className="num-cell">Acumulado</th>
                  <th>Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {depreciaciones.map((d, i) => (
                  <tr key={d.id}>
                    <td>{d.periodo}</td>
                    <td className="num-cell">{cop(d.valor)}</td>
                    <td className="num-cell">{cop(depreciaciones.slice(0, i + 1).reduce((s, x) => s + x.valor, 0))}</td>
                    <td>{d.comprobanteId ? `DIARIO ${d.comprobanteId}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num-cell">{cop(total)}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
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
