import { useCallback, useEffect, useRef, useState } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import ConfirmModal from "../components/ConfirmModal";
import { cop } from "../lib/formato";
import styles from "./Conciliaciones.module.css";

interface Periodo {
  id: number;
  nombre: string;
}

interface Movimiento {
  id: number;
  fecha: string;
  referencia: string;
  descripcion: string;
  debito: number | string;
  credito: number | string;
  saldo: number | string;
  conciliado: boolean;
  asientoId: number | null;
}

interface Conciliacion {
  id: number;
  periodoId: number;
  cuentaId: number;
  saldoLibros: number | string;
  saldoExtracto: number | string | null;
  diferencia: number | string | null;
  estado: "EN_PROCESO" | "APROBADA" | "ANULADA";
  aprobadaPor: string | null;
  aprobadaEn: string | null;
  periodo?: { nombre: string };
  cuenta?: { codigo: string; nombre: string };
  _count?: { movimientos: number };
  movimientos?: Movimiento[];
}

interface ResultadoImport {
  importadas: number;
  totalArchivo: number;
  errores: string[];
  movimientos: number;
  conciliados: number;
  diferencia: number;
}

const estadoLabel: Record<string, string> = { EN_PROCESO: "En proceso", APROBADA: "Aprobada", ANULADA: "Anulada" };

const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export default function Conciliaciones() {
  const { empresaActiva } = useEmpresa();
  const rol = empresaActiva?.rol;
  const puedeEditar = rol === "ADMIN" || rol === "CONTADOR";

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([]);
  const [periodoId, setPeriodoId] = useState("");

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [detalle, setDetalle] = useState<Conciliacion | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [anulando, setAnulando] = useState<Conciliacion | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await api.get<Conciliacion[]>("/conciliaciones");
      setConciliaciones(res.data);
    } catch {
      setError("No se pudieron cargar las conciliaciones.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api.get<Periodo[]>("/periodos").then((r) => setPeriodos(r.data)).catch(() => {});
  }, []);

  const crear = async () => {
    if (!periodoId) {
      setError("Seleccione un periodo antes de crear la conciliación.");
      return;
    }
    setError("");
    setMsg("");
    try {
      const res = await api.post<Conciliacion>("/conciliaciones", { periodoId: Number(periodoId) });
      setMsg(`Conciliación creada para el periodo ${periodos.find((p) => p.id === Number(periodoId))?.nombre ?? ""}.`);
      setConciliaciones((prev) => {
        const resto = prev.filter((c) => c.periodoId !== res.data.periodoId);
        return [res.data, ...resto];
      });
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "No se pudo crear la conciliación.");
    }
  };

  const importar = async () => {
    const archivo = archivoRef.current?.files?.[0];
    if (!periodoId || !archivo) {
      setError("Seleccione un periodo y un archivo CSV del extracto.");
      return;
    }
    setImportando(true);
    setError("");
    setMsg("");
    setResultado(null);
    const fd = new FormData();
    fd.append("periodoId", periodoId);
    fd.append("archivo", archivo);
    try {
      const res = await api.post<ResultadoImport & { conciliacion?: Conciliacion }>("/conciliaciones/importar", fd);
      setResultado(res.data);
      setMsg("Extracto importado y movimientos cruzados.");
      cargar();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "No se pudo importar el extracto.");
    } finally {
      setImportando(false);
    }
  };

  const verDetalle = async (c: Conciliacion) => {
    setError("");
    try {
      const res = await api.get<Conciliacion>(`/conciliaciones/${c.id}`);
      setDetalle(res.data);
    } catch {
      setError("No se pudo cargar el detalle.");
    }
  };

  const aprobar = async (c: Conciliacion) => {
    setError("");
    setMsg("");
    try {
      await api.post(`/conciliaciones/${c.id}/aprobar`);
      setMsg(`Conciliación ${c.periodo?.nombre ?? ""} aprobada.`);
      cargar();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "No se pudo aprobar la conciliación.");
    }
  };

  const anular = async (c: Conciliacion) => {
    setAnulando(null);
    setError("");
    setMsg("");
    try {
      await api.post(`/conciliaciones/${c.id}/anular`);
      setMsg(`Conciliación ${c.periodo?.nombre ?? ""} anulada.`);
      cargar();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "No se pudo anular la conciliación.");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Conciliación bancaria</h2>
          <p className="count-hint">Cruce del libro de bancos con el extracto por periodo.</p>
        </div>
      </div>

      {puedeEditar && (
        <div className={`section-card ${styles.conciliacionCrear}`}>
          <h3 className="section-title">Nueva conciliación</h3>
          <div className="filters">
            <select className="filter-input" value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
              <option value="">Seleccione el periodo</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary" onClick={crear}>
              Crear conciliación
            </button>
          </div>
          <div className="filters">
            <input ref={archivoRef} className="filter-input" type="file" accept=".csv,text/csv" />
            <button className="btn btn-primary" disabled={importando} onClick={importar}>
              {importando ? "Importando..." : "Importar extracto (CSV)"}
            </button>
          </div>
          <p className="count-hint">
            El extracto debe tener una columna de fecha, referencia, descripción y saldo. Al importar se cruzan los
            movimientos con los asientos del libro de bancos del periodo.
          </p>
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}
      {msg && <p className="success-msg">{msg}</p>}

      {resultado && (
        <div className="detail-grid">
          <span><em>Filas del archivo</em>{resultado.totalArchivo}</span>
          <span><em>Importadas</em>{resultado.importadas}</span>
          <span><em>Movimientos totales</em>{resultado.movimientos}</span>
          <span><em>Conciliados</em>{resultado.conciliados}</span>
          <span><em>Diferencia</em>{cop(resultado.diferencia)}</span>
          {resultado.errores.length > 0 && <span className="count-hint">Errores: {resultado.errores.slice(0, 3).join(" · ")}</span>}
        </div>
      )}

      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && conciliaciones.length === 0 && <p className="count-hint">Sin conciliaciones registradas.</p>}

      {!cargando && conciliaciones.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Cuenta</th>
                <th className="num-cell">Saldo libros</th>
                <th className="num-cell">Saldo extracto</th>
                <th className="num-cell">Diferencia</th>
                <th>Mov.</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {conciliaciones.map((c) => {
                const dif = num(c.diferencia);
                return (
                  <tr key={c.id}>
                    <td className="codigo-cell">{c.periodo?.nombre ?? c.periodoId}</td>
                    <td>{c.cuenta ? `${c.cuenta.codigo} ${c.cuenta.nombre}` : c.cuentaId}</td>
                    <td className="num-cell">{cop(num(c.saldoLibros) ?? 0)}</td>
                    <td className="num-cell">{c.saldoExtracto === null ? "—" : cop(num(c.saldoExtracto) ?? 0)}</td>
                    <td className="num-cell">{dif === null ? "—" : cop(dif)}</td>
                    <td>{c._count?.movimientos ?? 0}</td>
                    <td>
                      <span className={`badge ${c.estado === "APROBADA" ? "badge-mov" : c.estado === "ANULADA" ? "badge-err" : "badge-warn"}`}>
                        {estadoLabel[c.estado]}
                      </span>
                    </td>
                    <td className="acciones">
                      <button className="btn btn-secondary btn-sm" onClick={() => verDetalle(c)}>
                        Ver
                      </button>
                      {puedeEditar && c.estado !== "APROBADA" && c.estado !== "ANULADA" && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => aprobar(c)}>
                            Aprobar
                          </button>
                          <button className="btn btn-secondary btn-sm btn-danger" onClick={() => setAnulando(c)}>
                            Anular
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalle && <DetalleConciliacion conciliacion={detalle} onClose={() => setDetalle(null)} />}

      {anulando && (
        <ConfirmModal
          titulo="Anular conciliación"
          mensaje={`¿Anular la conciliación del periodo ${anulando.periodo?.nombre ?? ""}? Esta acción no se puede revertir.`}
          textoConfirmar="Anular"
          onConfirmar={() => anular(anulando)}
          onCancelar={() => setAnulando(null)}
        />
      )}
    </div>
  );
}

function DetalleConciliacion({ conciliacion: c, onClose }: { conciliacion: Conciliacion; onClose: () => void }) {
  const movimientos = c.movimientos ?? [];
  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h3>
          Conciliación {c.periodo?.nombre ?? ""} — {c.cuenta?.codigo ?? ""} {c.cuenta?.nombre ?? ""}
        </h3>
        <div className="detalle-grid">
          <span><em>Saldo libros</em>{cop(num(c.saldoLibros) ?? 0)}</span>
          <span><em>Saldo extracto</em>{c.saldoExtracto === null ? "—" : cop(num(c.saldoExtracto) ?? 0)}</span>
          <span><em>Diferencia</em>{num(c.diferencia) === null ? "—" : cop(num(c.diferencia) ?? 0)}</span>
          <span><em>Estado</em>{estadoLabel[c.estado]}</span>
          <span><em>Movimientos</em>{movimientos.length}</span>
        </div>
        {movimientos.length === 0 ? (
          <p className="count-hint">Sin movimientos importados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Ref</th>
                  <th>Descripción</th>
                  <th className="num-cell">Débito</th>
                  <th className="num-cell">Crédito</th>
                  <th className="num-cell">Saldo</th>
                  <th>Conciliado</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{m.fecha.slice(0, 10)}</td>
                    <td className="codigo-cell">{m.referencia}</td>
                    <td>{m.descripcion}</td>
                    <td className="num-cell">{num(m.debito) ? cop(num(m.debito) ?? 0) : ""}</td>
                    <td className="num-cell">{num(m.credito) ? cop(num(m.credito) ?? 0) : ""}</td>
                    <td className="num-cell">{cop(num(m.saldo) ?? 0)}</td>
                    <td>
                      <span className={`badge ${m.conciliado ? "badge-mov" : "badge-warn"}`}>
                        {m.conciliado ? "Conciliado" : "Pendiente"}
                      </span>
                    </td>
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
