import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import { cop } from "../lib/formato";

interface CierreListado {
  id: number;
  anio: number;
  fecha: string;
  comprobanteId: number;
  consecutivo: number;
  comprobanteFecha: string;
  cuentaUtilidadId: number;
  codigoCuentaUtilidad: string;
  nombreCuentaUtilidad: string;
  usuario: string;
}

interface AsientoDetalle {
  codigoCuenta: string;
  nombreCuenta: string;
  debito: number;
  credito: number;
  detalle: string | null;
}

interface CierreDetalle {
  id: number;
  anio: number;
  fecha: string;
  comprobanteId: number;
  comprobante: {
    tipo: string;
    consecutivo: number;
    fecha: string;
    concepto: string;
    totalDebito: number;
    totalCredito: number;
    asientos: AsientoDetalle[];
  };
  codigoCuentaUtilidad: string;
  nombreCuentaUtilidad: string;
  usuario: string;
}

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
}

export default function CierreAnual() {
  const { esAdmin } = useEmpresa();

  const [cierres, setCierres] = useState<CierreListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState<CierreDetalle | null>(null);

  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [cuentaUtilidadId, setCuentaUtilidadId] = useState("");
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await api.get<CierreListado[]>("/cierre-anual");
      setCierres(res.data);
    } catch {
      setError("No se pudieron cargar los cierres anuales.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api.get<Cuenta[]>("/cuentas?clase=3&soloMovimiento=true").then((r) => setCuentas(r.data)).catch(() => setError("No se pudieron cargar las cuentas."));
  }, []);

  const abrirDetalle = async (anioCierre: number) => {
    setError("");
    try {
      const res = await api.get<CierreDetalle>(`/cierre-anual/${anioCierre}`);
      setDetalle(res.data);
    } catch {
      setError("No se pudo cargar el detalle del cierre.");
    }
  };

  const ejecutarCierre = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const res = await api.post(`/cierre-anual/${Number(anio)}`, {
        cuentaUtilidadId: cuentaUtilidadId ? Number(cuentaUtilidadId) : undefined,
      });
      setMensaje(
        `Año ${res.data.cierre.anio} cerrado · Utilidad del ejercicio: ${cop(res.data.resumen.resultado)} · Comprobante DIARIO ${res.data.comprobante.consecutivo}.`
      );
      await cargar();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al cerrar el año.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Cierre de ejercicio anual</h2>
          <p className="count-hint">Asiento de cierre del ejercicio y habilitación del año siguiente.</p>
        </div>
      </div>

      {esAdmin && (
        <form onSubmit={ejecutarCierre} className="form-card form-card-ancho">
          <h3>Ejecutar cierre</h3>
          <div className="form-row">
            <label>
              Año a cerrar
              <input
                type="number"
                min="2000"
                max="2100"
                step="1"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                required
              />
            </label>
            <label>
              Cuenta de utilidades (clase 3)
              <select value={cuentaUtilidadId} onChange={(e) => setCuentaUtilidadId(e.target.value)}>
                <option value="">3605 - Utilidad del ejercicio</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} - {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="count-hint">
            El asiento traslada los saldos de las cuentas de resultado (clases 4 a 7) a la cuenta de utilidades. Requiere
            que todos los periodos del año estén cerrados.
          </p>
          {error && <p className="error-msg">{error}</p>}
          {mensaje && <p className="success-msg">{mensaje}</p>}
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? "Cerrando..." : "Cerrar año"}
          </button>
        </form>
      )}

      <h3 className="section-title">Años cerrados</h3>
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && cierres.length === 0 && <p className="count-hint">Aún no hay cierres anuales.</p>}

      {!cargando && cierres.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Año</th>
                <th className="num-cell">Comprobante</th>
                <th className="num-cell">Fecha del asiento</th>
                <th>Cuenta de utilidades</th>
                <th>Cerrado por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cierres.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.anio}</strong>
                  </td>
                  <td className="num-cell">
                    DIARIO {c.consecutivo} <span className="muted">#{c.comprobanteId}</span>
                  </td>
                  <td className="num-cell mono">{c.comprobanteFecha}</td>
                  <td className="codigo-cell">
                    {c.codigoCuentaUtilidad} - {c.nombreCuentaUtilidad}
                  </td>
                  <td>{c.usuario}</td>
                  <td className="acciones">
                    <button className="btn btn-secondary btn-sm" onClick={() => abrirDetalle(c.anio)}>
                      Ver asiento
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <div className="modal-backdrop">
          <div className="modal modal-wide">
            <h3>
              Asiento de cierre {detalle.anio} <span className="muted">{detalle.comprobante.concepto}</span>
            </h3>
            <div className="detail-grid">
              <span>
                <em>Comprobante</em> DIARIO {detalle.comprobante.consecutivo} #{detalle.comprobanteId}
              </span>
              <span>
                <em>Fecha</em> {detalle.comprobante.fecha}
              </span>
              <span>
                <em>Total débito</em> {cop(detalle.comprobante.totalDebito)}
              </span>
              <span>
                <em>Total crédito</em> {cop(detalle.comprobante.totalCredito)}
              </span>
              <span>
                <em>Cuenta de utilidades</em> {detalle.codigoCuentaUtilidad} - {detalle.nombreCuentaUtilidad}
              </span>
              <span>
                <em>Cerrado por</em> {detalle.usuario}
              </span>
            </div>
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
                  {detalle.comprobante.asientos.map((a, i) => (
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
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num-cell">{cop(detalle.comprobante.totalDebito)}</td>
                    <td className="num-cell">{cop(detalle.comprobante.totalCredito)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDetalle(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
