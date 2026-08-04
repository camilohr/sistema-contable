import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { cop } from "../lib/formato";

interface Parametro {
  id: number;
  diasDesde: number;
  diasHasta: number | null;
  porcentaje: number;
}

interface FilaParametro {
  diasDesde: string;
  diasHasta: string;
  porcentaje: string;
}

interface Periodo {
  id: number;
  nombre: string;
  estado: "ABIERTO" | "CERRADO";
}

interface AsientoDetalle {
  codigoCuenta: string;
  nombreCuenta?: string;
  debito: number;
  credito: number;
  detalle: string | null;
}

interface Linea {
  documentoId: number;
  numeroDocumento: string;
  tercero: string;
  saldo: number;
  diasMora: number;
  porcentaje: number;
  provision: number;
}

interface ResultadoCalculo {
  provision: { id: number; periodoId: number; totalCalculado: number; comprobanteId: number | null };
  resumen: { requerido: number; balanceProvision: number; incremental: number };
  comprobante: {
    id: number;
    tipo: string;
    consecutivo: number;
    fecha: string;
    concepto: string;
    totalDebito: number;
    totalCredito: number;
    numAsientos: number;
    asientos: AsientoDetalle[];
  } | null;
  lineas: Linea[];
}

interface ProvisionDetalle {
  id: number;
  periodoId: number;
  periodo: string;
  fecha: string;
  totalCalculado: number;
  comprobanteId: number | null;
  comprobante: {
    id: number;
    tipo: string;
    consecutivo: number;
    fecha: string;
    concepto: string;
    totalDebito: number;
    totalCredito: number;
    estado: string;
    asientos: AsientoDetalle[];
  } | null;
}

function filaVacia(): FilaParametro {
  return { diasDesde: "", diasHasta: "", porcentaje: "" };
}

export default function ProvisionCartera() {
  const { usuario } = useAuth();
  const puedeCalcular = usuario?.rol === "ADMIN" || usuario?.rol === "CONTADOR";

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoId, setPeriodoId] = useState("");

  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [editandoParametros, setEditandoParametros] = useState(false);
  const [filas, setFilas] = useState<FilaParametro[]>([]);

  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [consultado, setConsultado] = useState<ProvisionDetalle | null>(null);
  const [consultarPeriodoId, setConsultarPeriodoId] = useState("");

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargarPeriodos = useCallback(async () => {
    try {
      const res = await api.get<Periodo[]>("/periodos");
      setPeriodos(res.data);
      const abierto = res.data.find((p) => p.estado === "ABIERTO");
      setPeriodoId((cur) => cur || (abierto ? String(abierto.id) : ""));
    } catch {
      setError("No se pudieron cargar los periodos.");
    }
  }, []);

  const cargarParametros = useCallback(async () => {
    try {
      const res = await api.get<Parametro[]>("/cartera/provision/parametros");
      setParametros(res.data);
    } catch {
      setError("No se pudieron cargar los parámetros de provisión.");
    }
  }, []);

  useEffect(() => {
    Promise.all([cargarPeriodos(), cargarParametros()]).finally(() => setCargando(false));
  }, [cargarPeriodos, cargarParametros]);

  const calcular = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMensaje("");
    setConsultado(null);
    setEnviando(true);
    try {
      const res = await api.post<ResultadoCalculo>(`/cartera/provision/calcular/${Number(periodoId)}`);
      setResultado(res.data);
      setMensaje(
        res.data.comprobante
          ? `Provisión calculada: ${cop(res.data.resumen.incremental)} contabilizados en DIARIO ${res.data.comprobante.consecutivo}.`
          : "Provisión calculada: no requiere ajuste para este periodo."
      );
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al calcular la provisión.");
    } finally {
      setEnviando(false);
    }
  };

  const consultar = async () => {
    setError("");
    setMensaje("");
    try {
      const res = await api.get<ProvisionDetalle>(`/cartera/provision/${Number(consultarPeriodoId)}`);
      setConsultado(res.data);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo consultar la provisión.");
    }
  };

  const abrirEdicion = () => {
    setFilas(
      parametros.map((p) => ({
        diasDesde: String(p.diasDesde),
        diasHasta: p.diasHasta === null ? "" : String(p.diasHasta),
        porcentaje: String(p.porcentaje),
      }))
    );
    setEditandoParametros(true);
  };

  const actualizarFila = (i: number, campo: keyof FilaParametro, valor: string) => {
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  };

  const guardarParametros = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const parametrosBody = filas.map((f) => ({
        diasDesde: Number(f.diasDesde),
        diasHasta: f.diasHasta.trim() === "" ? null : Number(f.diasHasta),
        porcentaje: Number(f.porcentaje),
      }));
      const res = await api.put<Parametro[]>("/cartera/provision/parametros", { parametros: parametrosBody });
      setParametros(res.data);
      setEditandoParametros(false);
      setMensaje("Parámetros de provisión actualizados.");
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar los parámetros.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Provisión de cartera (deterioro)</h2>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {mensaje && <p className="success-msg">{mensaje}</p>}

      {cargando && <p className="count-hint">Cargando...</p>}

      {!cargando && puedeCalcular && (
        <form onSubmit={calcular} className="form-card">
          <h3>Calcular provisión</h3>
          <div className="form-row">
            <label>
              Periodo contable (abierto)
              <select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)} required>
                <option value="">Seleccione un periodo</option>
                {periodos
                  .filter((p) => p.estado === "ABIERTO")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p className="count-hint">
            Calcula el deterioro de la cartera con base en los días de mora al cierre del periodo. El asiento debita el
            gasto (5199) y acredita la provisión (1399), solo por el incremento no contabilizado. Si ya existe una
            provisión, anule su comprobante para recalcular.
          </p>
          <button type="submit" className="btn btn-primary" disabled={enviando || !periodoId}>
            {enviando ? "Calculando..." : "Calcular provisión"}
          </button>
        </form>
      )}

      {resultado && (
        <div className="section-card">
          <h3 className="section-title">
            Resultado del cálculo <span className="muted">(periodo {periodos.find((p) => p.id === resultado.provision.periodoId)?.nombre ?? ""})</span>
          </h3>
          <div className="detail-grid">
            <span>
              <em>Provisión requerida</em> {cop(resultado.resumen.requerido)}
            </span>
            <span>
              <em>Provisión ya contabilizada</em> {cop(resultado.resumen.balanceProvision)}
            </span>
            <span>
              <em>Incremento del periodo</em> {cop(resultado.resumen.incremental)}
            </span>
            <span>
              <em>Comprobante</em>{" "}
              {resultado.comprobante ? `DIARIO ${resultado.comprobante.consecutivo} (${resultado.comprobante.concepto})` : "Sin asiento (no requiere ajuste)"}
            </span>
          </div>

          {resultado.lineas.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Tercero</th>
                    <th className="num-cell">Saldo</th>
                    <th className="num-cell">Días de mora</th>
                    <th className="num-cell">%</th>
                    <th className="num-cell">Provisión</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.lineas.map((l) => (
                    <tr key={l.documentoId}>
                      <td className="mono">{l.numeroDocumento}</td>
                      <td>{l.tercero}</td>
                      <td className="num-cell">{cop(l.saldo)}</td>
                      <td className="num-cell">{l.diasMora}</td>
                      <td className="num-cell">{l.porcentaje}%</td>
                      <td className="num-cell">{cop(l.provision)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resultado.comprobante && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th className="num-cell">Débito</th>
                    <th className="num-cell">Crédito</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.comprobante.asientos.map((a, i) => (
                    <tr key={i}>
                      <td className="codigo-cell">{a.codigoCuenta}</td>
                      <td className="num-cell">{a.debito > 0 ? cop(a.debito) : ""}</td>
                      <td className="num-cell">{a.credito > 0 ? cop(a.credito) : ""}</td>
                      <td>{a.detalle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!cargando && (
        <div className="section-card">
          <h3 className="section-title">Consultar provisión por periodo</h3>
          <div className="form-row">
            <select value={consultarPeriodoId} onChange={(e) => setConsultarPeriodoId(e.target.value)}>
              <option value="">Seleccione un periodo</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={consultar} disabled={!consultarPeriodoId}>
              Consultar
            </button>
          </div>

          {consultado && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th className="num-cell">Provisión calculada</th>
                    <th>Comprobante</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{consultado.periodo}</td>
                    <td className="num-cell">{cop(consultado.totalCalculado)}</td>
                    <td>
                      {consultado.comprobante
                        ? `DIARIO ${consultado.comprobante.consecutivo} · ${consultado.comprobante.estado}`
                        : "Sin comprobante (no requirió ajuste)"}
                    </td>
                    <td className="acciones">
                      {consultado.comprobante && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConsultado({ ...consultado, comprobante: null })}
                        >
                          Ver asiento
                        </button>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
              {consultado.comprobante && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cuenta</th>
                      <th className="num-cell">Débito</th>
                      <th className="num-cell">Crédito</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consultado.comprobante.asientos.map((a, i) => (
                      <tr key={i}>
                        <td className="codigo-cell">
                          {a.codigoCuenta} - {a.nombreCuenta}
                        </td>
                        <td className="num-cell">{a.debito > 0 ? cop(a.debito) : ""}</td>
                        <td className="num-cell">{a.credito > 0 ? cop(a.credito) : ""}</td>
                        <td>{a.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {!cargando && (
        <div className="section-card">
          <h3 className="section-title">Parámetros de provisión (días de mora)</h3>
          {!editandoParametros ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="num-cell">Desde (días)</th>
                      <th className="num-cell">Hasta (días)</th>
                      <th className="num-cell">Porcentaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parametros.map((p) => (
                      <tr key={`${p.diasDesde}-${p.diasHasta}`}>
                        <td className="num-cell">{p.diasDesde}</td>
                        <td className="num-cell">{p.diasHasta === null ? "En adelante" : p.diasHasta}</td>
                        <td className="num-cell">{p.porcentaje}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {puedeCalcular && (
                <button type="button" className="btn btn-secondary" onClick={abrirEdicion}>
                  Editar parámetros
                </button>
              )}
            </>
          ) : (
            <form onSubmit={guardarParametros}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="num-cell">Desde (días)</th>
                      <th className="num-cell">Hasta (días)</th>
                      <th className="num-cell">Porcentaje</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={f.diasDesde}
                            onChange={(e) => actualizarFila(i, "diasDesde", e.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="sin límite"
                            value={f.diasHasta}
                            onChange={(e) => actualizarFila(i, "diasHasta", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={f.porcentaje}
                            onChange={(e) => actualizarFila(i, "porcentaje", e.target.value)}
                            required
                          />
                        </td>
                        <td className="acciones">
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setFilas((fs) => [...fs, filaVacia()])}
                >
                  Agregar rango
                </button>
                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  {enviando ? "Guardando..." : "Guardar parámetros"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditandoParametros(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
