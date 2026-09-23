import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import { cop } from "../lib/formato";

interface Periodo {
  id: number;
  nombre: string;
  estado: "ABIERTO" | "CERRADO";
}

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
  activa: boolean;
  permiteMovimiento: boolean;
}

interface Partida {
  cuentaId: string;
  valor: string;
}

interface PartidaRespuesta {
  id: number;
  cuentaId: number;
  codigo: string;
  nombre: string;
  valor: number;
}

interface LineaEjecucion {
  cuentaId: number;
  codigo: string;
  nombre: string;
  clase: number;
  naturaleza: "DEUDORA" | "ACREEDORA";
  presupuestado: number;
  ejecutado: number;
  variacion: number;
  porcentajeEjecucion: number | null;
}

interface ResultadoEjecucion {
  periodo: { id: number; nombre: string; estado: string };
  totalPresupuestado: number;
  totalEjecutado: number;
  variacionTotal: number;
  porcentajeEjecucionTotal: number | null;
  lineas: LineaEjecucion[];
}

function filaVacia(): Partida {
  return { cuentaId: "", valor: "" };
}

function SelectorCuenta({
  cuentas,
  valor,
  onChange,
}: {
  cuentas: Cuenta[];
  valor: string;
  onChange: (id: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const seleccionada = cuentas.find((c) => String(c.id) === valor);
  const filtradas = cuentas
    .filter(
      (c) =>
        c.codigo.includes(busqueda.trim()) ||
        c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
    )
    .slice(0, 60);

  const opciones = seleccionada && !filtradas.some((c) => c.id === seleccionada.id)
    ? [seleccionada, ...filtradas]
    : filtradas;

  return (
    <div>
      <input
        type="text"
        placeholder="Buscar cuenta (código o nombre)..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Seleccione una cuenta</option>
        {opciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} - {c.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Presupuesto() {
  const { puedeEditar } = useEmpresa();

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);

  const [periodoId, setPeriodoId] = useState("");
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [totalEditando, setTotalEditando] = useState(0);

  const [consultarPeriodoId, setConsultarPeriodoId] = useState("");
  const [ejecucion, setEjecucion] = useState<ResultadoEjecucion | null>(null);

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargarBase = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api.get<Periodo[]>("/periodos"),
        api.get<Cuenta[]>("/cuentas?soloMovimiento=true"),
      ]);
      setPeriodos(p.data);
      setCuentas(c.data.filter((x) => x.activa));
      const abierto = p.data.find((x) => x.estado === "ABIERTO");
      setPeriodoId((cur) => cur || (abierto ? String(abierto.id) : ""));
      setConsultarPeriodoId((cur) => cur || (abierto ? String(abierto.id) : ""));
    } catch {
      setError("No se pudieron cargar los datos base.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarBase();
  }, [cargarBase]);

  const cargarPartidas = useCallback(async (pid: string) => {
    if (!pid) return;
    try {
      const res = await api.get<{ partidas: PartidaRespuesta[]; totalPresupuestado: number }>(
        `/presupuesto/${Number(pid)}`
      );
      setPartidas(res.data.partidas.map((x) => ({ cuentaId: String(x.cuentaId), valor: String(x.valor) })));
      setTotalEditando(res.data.totalPresupuestado);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo cargar el presupuesto del periodo.");
    }
  }, []);

  useEffect(() => {
    if (periodoId) cargarPartidas(periodoId);
  }, [periodoId, cargarPartidas]);

  const actualizarPartida = (i: number, campo: keyof Partida, valor: string) => {
    setPartidas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const partidasBody = partidas
        .filter((p) => p.cuentaId !== "" && p.valor.trim() !== "")
        .map((p) => ({ cuentaId: Number(p.cuentaId), valor: Number(p.valor) }));
      const res = await api.put<{ partidas: PartidaRespuesta[]; totalPresupuestado: number }>(
        `/presupuesto/${Number(periodoId)}`,
        { partidas: partidasBody }
      );
      setPartidas(res.data.partidas.map((x) => ({ cuentaId: String(x.cuentaId), valor: String(x.valor) })));
      setTotalEditando(res.data.totalPresupuestado);
      setMensaje(`Presupuesto del periodo guardado: ${cop(res.data.totalPresupuestado)}.`);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar el presupuesto.");
    } finally {
      setEnviando(false);
    }
  };

  const consultar = async () => {
    setError("");
    setMensaje("");
    setEjecucion(null);
    try {
      const res = await api.get<ResultadoEjecucion>(`/presupuesto/${Number(consultarPeriodoId)}/ejecucion`);
      setEjecucion(res.data);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo consultar la ejecución.");
    }
  };

  const badgeVariacion = (v: number) => {
    if (v === 0) return "badge-warn";
    if (v > 0) return "badge-mov";
    return "badge-err";
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Presupuesto y control presupuestal</h2>
          <p className="count-hint">Carga del presupuesto por periodo y su ejecución.</p>
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {mensaje && <p className="success-msg">{mensaje}</p>}

      {cargando && <p className="count-hint">Cargando...</p>}

      {!cargando && puedeEditar && (
        <form onSubmit={guardar} className="form-card form-card-ancho">
          <h3>Cargar presupuesto por periodo</h3>
          <div className="form-row">
            <label>
              Periodo contable
              <select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)} required>
                <option value="">Seleccione un periodo</option>
                {periodos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.estado === "ABIERTO" ? "abierto" : "cerrado"})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="num-cell">Valor presupuestado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {partidas.length === 0 && (
                  <tr>
                    <td colSpan={3} className="count-hint">
                      Sin partidas. Agregue cuentas al presupuesto del periodo.
                    </td>
                  </tr>
                )}
                {partidas.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <SelectorCuenta cuentas={cuentas} valor={p.cuentaId} onChange={(id) => actualizarPartida(i, "cuentaId", id)} />
                    </td>
                    <td className="num-cell">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.valor}
                        onChange={(e) => actualizarPartida(i, "valor", e.target.value)}
                        required
                      />
                    </td>
                    <td className="acciones">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setPartidas((ps) => ps.filter((_, j) => j !== i))}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="count-hint">
            Presupuesto actual del periodo: <strong>{cop(totalEditando)}</strong>. Guardar reemplaza las partidas
            existentes. Solo cuentas activas con movimiento.
          </p>
          <div className="form-row">
            <button type="button" className="btn btn-secondary" onClick={() => setPartidas((ps) => [...ps, filaVacia()])}>
              Agregar cuenta
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando || !periodoId}>
              {enviando ? "Guardando..." : "Guardar presupuesto"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => cargarPartidas(periodoId)}
            >
              Recargar
            </button>
          </div>
        </form>
      )}

      {!cargando && (
        <div className="section-card">
          <h3 className="section-title">Ejecución presupuestal</h3>
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

          {ejecucion && (
            <>
              <div className="detail-grid">
                <span>
                  <em>Presupuestado</em> {cop(ejecucion.totalPresupuestado)}
                </span>
                <span>
                  <em>Ejecutado</em> {cop(ejecucion.totalEjecutado)}
                </span>
                <span>
                  <em>Variación</em> {cop(ejecucion.variacionTotal)}
                </span>
                <span>
                  <em>% de ejecución</em>{" "}
                  {ejecucion.porcentajeEjecucionTotal === null ? "—" : `${ejecucion.porcentajeEjecucionTotal}%`}
                </span>
              </div>

              {ejecucion.lineas.length === 0 ? (
                <p className="count-hint">Este periodo no tiene presupuesto cargado.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cuenta</th>
                        <th className="num-cell">Presupuestado</th>
                        <th className="num-cell">Ejecutado</th>
                        <th className="num-cell">Variación</th>
                        <th className="num-cell">% ejecución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ejecucion.lineas.map((l) => (
                        <tr key={l.cuentaId}>
                          <td className="codigo-cell">
                            {l.codigo} - {l.nombre}
                          </td>
                          <td className="num-cell">{cop(l.presupuestado)}</td>
                          <td className="num-cell">{cop(l.ejecutado)}</td>
                          <td className="num-cell">
                            <span className={`badge ${badgeVariacion(l.variacion)}`}>{cop(l.variacion)}</span>
                          </td>
                          <td className="num-cell">{l.porcentajeEjecucion === null ? "—" : `${l.porcentajeEjecucion}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
