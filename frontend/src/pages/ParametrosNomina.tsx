import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

interface ParametroNomina {
  anio: number;
  smmlv: number;
  auxilioTransporte: number;
  topeAuxilioTransporteSalarios: number;
  topeIbcSalarios: number;
  saludEmpleado: number;
  pensionEmpleado: number;
  saludEmpleador: number;
  pensionEmpleador: number;
  arlEmpleador: number;
  cajaCompensacion: number;
  icbf: number;
  sena: number;
  umbralParafiscales: number;
  solidaridadUmbralSalarios: number;
  interesesCesantias: number;
}

interface ParametroCuenta {
  concepto: string;
  cuentaId: number;
  codigoCuenta: string;
  nombreCuenta: string;
}

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
  activa: boolean;
  permiteMovimiento: boolean;
}

interface CampoParametro {
  key: keyof ParametroNomina;
  label: string;
  step: string;
  min: number;
  max?: number;
}

const camposParametro: CampoParametro[] = [
  { key: "smmlv", label: "SMMLV", step: "0.01", min: 0 },
  { key: "auxilioTransporte", label: "Auxilio de transporte", step: "0.01", min: 0 },
  { key: "topeAuxilioTransporteSalarios", label: "Tope auxilio (salarios)", step: "0.01", min: 0 },
  { key: "topeIbcSalarios", label: "Tope IBC (salarios)", step: "0.01", min: 0 },
  { key: "saludEmpleado", label: "Salud empleado (%)", step: "0.01", min: 0, max: 100 },
  { key: "pensionEmpleado", label: "Pensión empleado (%)", step: "0.01", min: 0, max: 100 },
  { key: "saludEmpleador", label: "Salud empleador (%)", step: "0.01", min: 0, max: 100 },
  { key: "pensionEmpleador", label: "Pensión empleador (%)", step: "0.01", min: 0, max: 100 },
  { key: "arlEmpleador", label: "ARL empleador (%)", step: "0.001", min: 0, max: 100 },
  { key: "cajaCompensacion", label: "Caja compensación (%)", step: "0.01", min: 0, max: 100 },
  { key: "icbf", label: "ICBF (%)", step: "0.01", min: 0, max: 100 },
  { key: "sena", label: "SENA (%)", step: "0.01", min: 0, max: 100 },
  { key: "umbralParafiscales", label: "Empleados para parafiscales", step: "1", min: 1 },
  { key: "solidaridadUmbralSalarios", label: "Umbral solidaridad (salarios)", step: "0.01", min: 0 },
  { key: "interesesCesantias", label: "Intereses cesantías anual (%)", step: "0.01", min: 0, max: 100 },
];

export default function ParametrosNomina() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "ADMIN" || usuario?.rol === "CONTADOR";

  const [parametros, setParametros] = useState<ParametroNomina[]>([]);
  const [anio, setAnio] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [mapeo, setMapeo] = useState<ParametroCuenta[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [p, m, c] = await Promise.all([
        api.get<ParametroNomina[]>("/nomina/parametros"),
        api.get<ParametroCuenta[]>("/nomina/parametros-cuentas"),
        api.get<Cuenta[]>("/cuentas?soloMovimiento=true"),
      ]);
      setParametros(p.data);
      const anioInicial = p.data.length > 0 ? String(p.data[0].anio) : "";
      setAnio(anioInicial);
      setMapeo(m.data);
      setSeleccion(Object.fromEntries(m.data.map((x) => [x.concepto, String(x.cuentaId)])));
      setCuentas(c.data.filter((x) => x.activa));
      if (anioInicial) setForm(camposTexto(p.data[0]));
    } catch {
      setError("No se pudieron cargar los parámetros de nómina.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const camposTexto = (p: ParametroNomina): Record<string, string> =>
    Object.fromEntries(camposParametro.map((c) => [c.key, String(p[c.key as keyof ParametroNomina])]));

  const elegirAnio = (v: string) => {
    setAnio(v);
    const p = parametros.find((x) => String(x.anio) === v);
    setForm(p ? camposTexto(p) : Object.fromEntries(camposParametro.map((c) => [c.key, ""])));
  };

  const guardarParametros = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const body: Record<string, number> = {};
      for (const c of camposParametro) body[c.key] = Number(form[c.key]);
      const res = await api.put<ParametroNomina>(`/nomina/parametros/${Number(anio)}`, body);
      setParametros((ps) => {
        const sin = ps.filter((x) => x.anio !== res.data.anio);
        return [...sin, res.data].sort((a, b) => a.anio - b.anio);
      });
      setMensaje(`Parámetros de nómina ${res.data.anio} guardados.`);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar los parámetros.");
    } finally {
      setEnviando(false);
    }
  };

  const guardarMapeo = async () => {
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const cuentasBody = mapeo.map((m) => ({ concepto: m.concepto, cuentaId: Number(seleccion[m.concepto]) }));
      const res = await api.put<ParametroCuenta[]>("/nomina/parametros-cuentas", { cuentas: cuentasBody });
      setMapeo(res.data);
      setSeleccion(Object.fromEntries(res.data.map((x) => [x.concepto, String(x.cuentaId)])));
      setMensaje("Mapeo de cuentas de nómina actualizado.");
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar el mapeo de cuentas.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Parámetros de nómina</h2>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {mensaje && <p className="success-msg">{mensaje}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}

      {!cargando && (
        <form onSubmit={guardarParametros} className="form-card">
          <h3>Parámetros por año</h3>
          <div className="form-row">
            <label>
              Año
              <input type="number" min="2000" max="2100" step="1" value={anio} onChange={(e) => elegirAnio(e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            {camposParametro.map((c) => (
              <label key={c.key}>
                {c.label}
                <input
                  type="number"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={form[c.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                  required
                />
              </label>
            ))}
          </div>
          <p className="count-hint">
            Valores 2026 (Decretos 1469 y 1470 de 2025): SMMLV $1.750.905 y auxilio de transporte $249.095. La ARL
            puede variar por empleado; aquí se define la tasa por defecto.
          </p>
          {puedeEditar && (
            <button type="submit" className="btn btn-primary" disabled={enviando || !anio}>
              {enviando ? "Guardando..." : "Guardar parámetros"}
            </button>
          )}
        </form>
      )}

      {!cargando && (
        <div className="section-card">
          <h3 className="section-title">Mapeo de cuentas contables (PUC)</h3>
          <p className="count-hint">
            Cada concepto de nómina se contabiliza en la cuenta indicada. Solo se listan cuentas activas que permiten
            movimiento.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Cuenta</th>
                  {puedeEditar && <th>Selección</th>}
                </tr>
              </thead>
              <tbody>
                {mapeo.map((m) => (
                  <tr key={m.concepto}>
                    <td className="mono">{m.concepto}</td>
                    <td className="codigo-cell">
                      {m.codigoCuenta} - {m.nombreCuenta}
                    </td>
                    {puedeEditar && (
                      <td>
                        <select value={seleccion[m.concepto] ?? ""} onChange={(e) => setSeleccion((s) => ({ ...s, [m.concepto]: e.target.value }))}>
                          {cuentas.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.codigo} - {c.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {puedeEditar && (
            <button type="button" className="btn btn-primary" onClick={guardarMapeo} disabled={enviando}>
              {enviando ? "Guardando..." : "Guardar mapeo"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
