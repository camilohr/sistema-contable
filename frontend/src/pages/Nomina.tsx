import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { cop } from "../lib/formato";

interface Periodo {
  id: number;
  nombre: string;
  estado: "ABIERTO" | "CERRADO";
}

interface Empleado {
  id: string;
  documento: string;
  nombre: string;
}

interface Asiento {
  codigoCuenta: string;
  nombreCuenta?: string;
  debito: number;
  credito: number;
  detalle: string | null;
}

interface LineaNomina {
  id: number;
  empleadoId: string;
  documento: string;
  nombre: string;
  diasTrabajados: number;
  sueldo: number;
  horasExtras: number;
  comisiones: number;
  bonificaciones: number;
  auxilioTransporte: number;
  otrosDevengados: number;
  ibc: number;
  saludEmpleado: number;
  pensionEmpleado: number;
  solidaridad: number;
  retefuente: number;
  libranzas: number;
  embargos: number;
  otrosDescuentos: number;
  aporteSalud: number;
  aportePension: number;
  aporteArl: number;
  aporteCaja: number;
  aporteIcbf: number;
  aporteSena: number;
  totalDevengado: number;
  totalDeducciones: number;
  netoPagar: number;
  estado: string;
  comprobanteId: number | null;
}

interface Totales {
  totalDevengado: number;
  totalDeducciones: number;
  netoPagar: number;
  aportes: { salud: number; pension: number; arl: number; caja: number; icbf: number; sena: number };
}

interface ResultadoLiquidacion {
  periodo: string;
  empleados: number;
  lineas: LineaNomina[];
  totales: Totales;
}

interface Comprobante {
  id: number;
  consecutivo: number;
  fecha: string;
  concepto: string;
  totalDebito: number;
  totalCredito: number;
  numAsientos: number;
  asientos: Asiento[];
}

interface ResultadoContabilizar {
  comprobante: Comprobante;
  totales: Totales;
}

interface ResultadoProvisionar {
  comprobante: Comprobante;
  total: number;
}

interface LineaProvision {
  id: number;
  empleadoId: string;
  documento: string;
  nombre: string;
  baseCesantias: number;
  cesantias: number;
  interesesCesantias: number;
  prima: number;
  baseVacaciones: number;
  vacaciones: number;
  total: number;
}

interface DetalleProvision {
  periodo: string;
  periodoId: number;
  total: number;
  comprobante: (Comprobante & { estado: string }) | null;
  lineas: LineaProvision[];
}

const ajusteCampos = [
  { key: "diasTrabajados", label: "Días", step: "1" },
  { key: "horasExtras", label: "H. extras", step: "0.01" },
  { key: "comisiones", label: "Comisiones", step: "0.01" },
  { key: "bonificaciones", label: "Bonific.", step: "0.01" },
  { key: "otrosDevengados", label: "Otros dev.", step: "0.01" },
  { key: "retefuente", label: "Retef.", step: "0.01" },
  { key: "libranzas", label: "Libranzas", step: "0.01" },
  { key: "embargos", label: "Embargos", step: "0.01" },
  { key: "otrosDescuentos", label: "Otros desc.", step: "0.01" },
] as const;

function ajusteVacio(): Record<string, string> {
  return Object.fromEntries(ajusteCampos.map((c) => [c.key, c.key === "diasTrabajados" ? "30" : "0"]));
}

function TablaAsientos({ comprobante }: { comprobante: { asientos: Asiento[]; consecutivo: number; concepto: string; estado?: string } }) {
  return (
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
          {comprobante.asientos.map((a, i) => (
            <tr key={i}>
              <td className="codigo-cell">
                {a.codigoCuenta}
                {a.nombreCuenta ? ` - ${a.nombreCuenta}` : ""}
              </td>
              <td className="num-cell">{a.debito > 0 ? cop(a.debito) : ""}</td>
              <td className="num-cell">{a.credito > 0 ? cop(a.credito) : ""}</td>
              <td>{a.detalle}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Totales</td>
            <td className="num-cell">{cop(comprobante.asientos.reduce((s, a) => s + a.debito, 0))}</td>
            <td className="num-cell">{cop(comprobante.asientos.reduce((s, a) => s + a.credito, 0))}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <p className="count-hint">
        DIARIO {comprobante.consecutivo} · {comprobante.concepto}
        {comprobante.estado ? ` · ${comprobante.estado}` : ""}
      </p>
    </div>
  );
}

export default function Nomina() {
  const { usuario } = useAuth();
  const puedeOperar = usuario?.rol === "ADMIN" || usuario?.rol === "CONTADOR";

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoId, setPeriodoId] = useState("");
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [ajustes, setAjustes] = useState<Record<string, Record<string, string>>>({});

  const [resultado, setResultado] = useState<ResultadoLiquidacion | null>(null);
  const [contabilizado, setContabilizado] = useState<ResultadoContabilizar | null>(null);
  const [provisionado, setProvisionado] = useState<ResultadoProvisionar | null>(null);

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [consultarPeriodoId, setConsultarPeriodoId] = useState("");
  const [consultaLiquidacion, setConsultaLiquidacion] = useState<ResultadoLiquidacion | null>(null);
  const [consultaProvision, setConsultaProvision] = useState<DetalleProvision | null>(null);

  const cargarBase = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([api.get<Periodo[]>("/periodos"), api.get<Empleado[]>("/empleados?activo=true")]);
      setPeriodos(p.data);
      const abierto = p.data.find((x) => x.estado === "ABIERTO");
      setPeriodoId((cur) => cur || (abierto ? String(abierto.id) : ""));
      setEmpleados(e.data);
      setAjustes((cur) => {
        if (Object.keys(cur).length > 0) return cur;
        return Object.fromEntries(e.data.map((x) => [x.id, ajusteVacio()]));
      });
    } catch {
      setError("No se pudieron cargar los datos base.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarBase();
  }, [cargarBase]);

  const actualizarAjuste = (empleadoId: string, campo: string, valor: string) => {
    setAjustes((a) => ({ ...a, [empleadoId]: { ...a[empleadoId], [campo]: valor } }));
  };

  const liquidar = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMensaje("");
    setContabilizado(null);
    setProvisionado(null);
    setEnviando(true);
    try {
      const ajustesBody = empleados.map((emp) => {
        const a = ajustes[emp.id] ?? ajusteVacio();
        const fila: Record<string, number> = { empleadoId: Number(emp.id) };
        for (const c of ajusteCampos) fila[c.key] = Number(a[c.key] ?? 0);
        return fila;
      });
      const res = await api.post<ResultadoLiquidacion>(`/nomina/liquidar/${Number(periodoId)}`, { ajustes: ajustesBody });
      setResultado(res.data);
      setMensaje(`Nómina liquidada: ${res.data.empleados} empleados.`);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al liquidar la nómina.");
    } finally {
      setEnviando(false);
    }
  };

  const contabilizar = async () => {
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const res = await api.post<ResultadoContabilizar>(`/nomina/contabilizar/${Number(periodoId)}`);
      setContabilizado(res.data);
      setMensaje(`Nómina contabilizada en DIARIO ${res.data.comprobante.consecutivo}.`);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al contabilizar la nómina.");
    } finally {
      setEnviando(false);
    }
  };

  const provisionar = async () => {
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const res = await api.post<ResultadoProvisionar>(`/nomina/provisionar/${Number(periodoId)}`);
      setProvisionado(res.data);
      setMensaje(`Provisión de prestaciones contabilizada en DIARIO ${res.data.comprobante.consecutivo}.`);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al provisionar prestaciones.");
    } finally {
      setEnviando(false);
    }
  };

  const consultar = async () => {
    setError("");
    setMensaje("");
    setConsultaLiquidacion(null);
    setConsultaProvision(null);
    try {
      const [l, pv] = await Promise.all([
        api.get<ResultadoLiquidacion>(`/nomina/${Number(consultarPeriodoId)}`),
        api.get<DetalleProvision>(`/nomina/provision/${Number(consultarPeriodoId)}`),
      ]);
      setConsultaLiquidacion(l.data);
      setConsultaProvision(pv.data);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo consultar el periodo.");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Nómina</h2>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {mensaje && <p className="success-msg">{mensaje}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}

      {!cargando && puedeOperar && (
        <form onSubmit={liquidar} className="form-card">
          <h3>Liquidación de periodo</h3>
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

          {empleados.length === 0 ? (
            <p className="count-hint">No hay empleados activos. Regístrelos desde el módulo de empleados.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Empleado</th>
                    {ajusteCampos.map((c) => (
                      <th key={c.key} className="num-cell">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((emp) => {
                    const a = ajustes[emp.id] ?? ajusteVacio();
                    return (
                      <tr key={emp.id}>
                        <td>
                          <span className="mono">{emp.documento}</span> {emp.nombre}
                        </td>
                        {ajusteCampos.map((c) => (
                          <td key={c.key}>
                            <input
                              type="number"
                              min={c.key === "diasTrabajados" ? "1" : "0"}
                              max={c.key === "diasTrabajados" ? "31" : undefined}
                              step={c.step}
                              value={a[c.key] ?? ""}
                              onChange={(ev) => actualizarAjuste(emp.id, c.key, ev.target.value)}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="count-hint">
            Liquida la nómina mensual (sueldo, auxilio de transporte, IBC, aportes, parafiscales si hay 10 o más
            empleados, retefuente y descuentos). Puede reliquidar mientras no esté contabilizada.
          </p>
          <div className="form-row">
            <button type="submit" className="btn btn-primary" disabled={enviando || !periodoId || empleados.length === 0}>
              {enviando ? "Liquidando..." : "Liquidar"}
            </button>
            {resultado && (
              <button type="button" className="btn btn-secondary" onClick={contabilizar} disabled={enviando}>
                Contabilizar
              </button>
            )}
            {resultado && (
              <button type="button" className="btn btn-secondary" onClick={provisionar} disabled={enviando}>
                Provisionar prestaciones
              </button>
            )}
          </div>
        </form>
      )}

      {!cargando && !puedeOperar && (
        <p className="count-hint">Como AUXILIAR puede consultar nóminas, pero no liquidar ni contabilizar.</p>
      )}

      {resultado && (
        <div className="section-card">
          <h3 className="section-title">Liquidación del periodo {resultado.periodo}</h3>
          <div className="detail-grid">
            <span>
              <em>Total devengado</em> {cop(resultado.totales.totalDevengado)}
            </span>
            <span>
              <em>Total deducciones</em> {cop(resultado.totales.totalDeducciones)}
            </span>
            <span>
              <em>Neto por pagar</em> {cop(resultado.totales.netoPagar)}
            </span>
            <span>
              <em>Aportes salud / pensión</em> {cop(resultado.totales.aportes.salud)} / {cop(resultado.totales.aportes.pension)}
            </span>
            <span>
              <em>ARL / Caja</em> {cop(resultado.totales.aportes.arl)} / {cop(resultado.totales.aportes.caja)}
            </span>
            <span>
              <em>ICBF / SENA</em> {cop(resultado.totales.aportes.icbf)} / {cop(resultado.totales.aportes.sena)}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th className="num-cell">Sueldo</th>
                  <th className="num-cell">Aux. transp.</th>
                  <th className="num-cell">IBC</th>
                  <th className="num-cell">Deducciones</th>
                  <th className="num-cell">Neto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {resultado.lineas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="mono">{l.documento}</span> {l.nombre}
                    </td>
                    <td className="num-cell">{cop(l.sueldo)}</td>
                    <td className="num-cell">{cop(l.auxilioTransporte)}</td>
                    <td className="num-cell">{cop(l.ibc)}</td>
                    <td className="num-cell">{cop(l.totalDeducciones)}</td>
                    <td className="num-cell">{cop(l.netoPagar)}</td>
                    <td>
                      <span className={`badge ${l.estado === "CONTABILIZADO" ? "badge-mov" : l.estado === "ANULADO" ? "badge-err" : "badge-warn"}`}>
                        {l.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {contabilizado && (
        <div className="section-card">
          <h3 className="section-title">Comprobante de nómina (DIARIO {contabilizado.comprobante.consecutivo})</h3>
          <TablaAsientos comprobante={contabilizado.comprobante} />
        </div>
      )}

      {provisionado && (
        <div className="section-card">
          <h3 className="section-title">
            Provisión de prestaciones (DIARIO {provisionado.comprobante.consecutivo}) · Total {cop(provisionado.total)}
          </h3>
          <TablaAsientos comprobante={provisionado.comprobante} />
        </div>
      )}

      {!cargando && (
        <div className="section-card">
          <h3 className="section-title">Consultar nómina y provisión por periodo</h3>
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

          {consultaLiquidacion && (
            <>
              <h4 className="section-title">Liquidación {consultaLiquidacion.periodo}</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th className="num-cell">Devengado</th>
                      <th className="num-cell">Deducciones</th>
                      <th className="num-cell">Neto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consultaLiquidacion.lineas.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <span className="mono">{l.documento}</span> {l.nombre}
                        </td>
                        <td className="num-cell">{cop(l.totalDevengado)}</td>
                        <td className="num-cell">{cop(l.totalDeducciones)}</td>
                        <td className="num-cell">{cop(l.netoPagar)}</td>
                        <td>{l.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {consultaProvision && (
            <>
              <h4 className="section-title">Provisión de prestaciones {consultaProvision.periodo}</h4>
              <div className="detail-grid">
                <span>
                  <em>Total provisión</em> {cop(consultaProvision.total)}
                </span>
                <span>
                  <em>Comprobante</em>{" "}
                  {consultaProvision.comprobante
                    ? `DIARIO ${consultaProvision.comprobante.consecutivo} · ${consultaProvision.comprobante.estado}`
                    : "Sin comprobante"}
                </span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th className="num-cell">Cesantías</th>
                      <th className="num-cell">Intereses</th>
                      <th className="num-cell">Prima</th>
                      <th className="num-cell">Vacaciones</th>
                      <th className="num-cell">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consultaProvision.lineas.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <span className="mono">{l.documento}</span> {l.nombre}
                        </td>
                        <td className="num-cell">{cop(l.cesantias)}</td>
                        <td className="num-cell">{cop(l.interesesCesantias)}</td>
                        <td className="num-cell">{cop(l.prima)}</td>
                        <td className="num-cell">{cop(l.vacaciones)}</td>
                        <td className="num-cell">{cop(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {consultaProvision.comprobante && <TablaAsientos comprobante={consultaProvision.comprobante} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
