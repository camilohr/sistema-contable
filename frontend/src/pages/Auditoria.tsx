import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

interface RegistroAuditoria {
  id: number;
  usuario: string;
  accion: string;
  entidad: string;
  entidadId: string;
  detalle: unknown;
  fecha: string;
}

const accionLabels: Record<string, string> = {
  CONTABILIZAR: "Contabilizar comprobante",
  ANULAR: "Anular comprobante",
  ELIMINAR_COMPROBANTE: "Eliminar comprobante",
  CERRAR_PERIODO: "Cerrar periodo",
  REABRIR_PERIODO: "Reabrir periodo",
  CREAR_USUARIO: "Crear usuario",
  CREAR_CUENTA: "Crear cuenta",
  EDITAR_CUENTA: "Editar cuenta",
  CREAR_ACTIVO: "Crear activo fijo",
  EDITAR_ACTIVO: "Editar activo fijo",
  DEPRECIAR_ACTIVOS: "Depreciar activos",
  BAJA_ACTIVO: "Dar de baja activo",
};

function badgeDe(accion: string): string {
  if (["ANULAR", "ELIMINAR_COMPROBANTE"].includes(accion)) return "badge-err";
  if (accion === "CERRAR_PERIODO") return "badge-warn";
  if (["CONTABILIZAR", "DEPRECIAR_ACTIVOS"].includes(accion)) return "badge-mov";
  if (["CREAR_USUARIO", "CREAR_CUENTA", "EDITAR_CUENTA", "CREAR_ACTIVO", "EDITAR_ACTIVO", "BAJA_ACTIVO"].includes(accion)) return "badge-terc";
  return "badge";
}

function formatearFecha(fecha: string): string {
  const d = new Date(fecha);
  return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

function resumenDetalle(detalle: unknown): string {
  if (detalle === null || detalle === undefined) return "";
  try {
    const s = JSON.stringify(detalle);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return String(detalle);
  }
}

export default function Auditoria() {
  const { usuario } = useAuth();
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [entidad, setEntidad] = useState("");
  const [accion, setAccion] = useState("");
  const [hayMas, setHayMas] = useState(false);
  const ultimoIdRef = useRef<number | null>(null);

  const cargar = useCallback(async (reset: boolean) => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams({ limite: "100" });
      if (entidad) params.set("entidad", entidad);
      if (accion) params.set("accion", accion);
      if (!reset && ultimoIdRef.current) params.set("antesDeId", String(ultimoIdRef.current));
      const res = await api.get<RegistroAuditoria[]>(`/auditoria?${params.toString()}`);
      setRegistros((prev) => (reset ? res.data : [...prev, ...res.data]));
      ultimoIdRef.current = res.data.length ? res.data[res.data.length - 1].id : null;
      setHayMas(res.data.length === 100);
    } catch {
      setError("No se pudieron cargar los registros.");
    } finally {
      setCargando(false);
    }
  }, [entidad, accion]);

  useEffect(() => {
    cargar(true);
  }, [cargar]);

  if (usuario?.rol !== "ADMIN") {
    return (
      <div className="page">
        <h2>Bitácora de auditoría</h2>
        <p className="error-msg">Solo el administrador puede consultar la bitácora.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Bitácora de auditoría</h2>
        <div className="filters">
          <select value={entidad} onChange={(e) => setEntidad(e.target.value)}>
            <option value="">Todas las entidades</option>
            <option value="Comprobante">Comprobante</option>
            <option value="Periodo">Periodo</option>
            <option value="Usuario">Usuario</option>
            <option value="Cuenta">Cuenta</option>
            <option value="ActivoFijo">Activo fijo</option>
          </select>
          <select value={accion} onChange={(e) => setAccion(e.target.value)}>
            <option value="">Todas las acciones</option>
            {Object.entries(accionLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="count-hint">Registro inmutable de las acciones críticas del sistema.</p>
      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && registros.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && registros.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id}>
                    <td className="num-cell">{formatearFecha(r.fecha)}</td>
                    <td>{r.usuario}</td>
                    <td>
                      <span className={`badge ${badgeDe(r.accion)}`}>{accionLabels[r.accion] ?? r.accion}</span>
                    </td>
                    <td>
                      {r.entidad} <span className="muted">#{r.entidadId}</span>
                    </td>
                    <td title={resumenDetalle(r.detalle)}>{resumenDetalle(r.detalle)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hayMas && (
            <button className="btn btn-secondary" onClick={() => cargar(false)} disabled={cargando}>
              Cargar más
            </button>
          )}
        </>
      )}
    </div>
  );
}
