import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import styles from "./AlertasPanel.module.css";

type Severidad = "ALTA" | "MEDIA" | "BAJA";
type TipoAlerta = "CARTERA_VENCE" | "PERIODO_SIN_CERRAR" | "ACTIVO_SIN_BAJA" | "TERCERO_SIN_MOVIMIENTO";

interface Alerta {
  tipo: TipoAlerta;
  severidad: Severidad;
  mensaje: string;
  entidad: string;
  entidadId: string;
  fecha: string;
  monto?: number;
}

interface Regla {
  tipo: TipoAlerta;
  dias: number | null;
  activa: boolean;
}

const ETIQUETAS_TIPO: Record<TipoAlerta, string> = {
  CARTERA_VENCE: "Cartera por vencer",
  PERIODO_SIN_CERRAR: "Periodo sin cerrar",
  ACTIVO_SIN_BAJA: "Activo sin dar de baja",
  TERCERO_SIN_MOVIMIENTO: "Cliente sin movimientos",
};

const ETIQUETAS_SEVERIDAD: Record<Severidad, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

function requiereDias(tipo: TipoAlerta): boolean {
  return tipo === "CARTERA_VENCE" || tipo === "TERCERO_SIN_MOVIMIENTO";
}

export default function AlertasPanel() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "ADMIN" || usuario?.rol === "CONTADOR";

  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [a, r] = await Promise.all([
        api.get<{ alertas: Alerta[] }>("/alertas"),
        api.get<Regla[]>("/alertas/reglas"),
      ]);
      setAlertas(a.data.alertas);
      setReglas(r.data);
    } catch {
      setError("No se pudieron cargar las alertas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizarRegla = (tipo: TipoAlerta, campo: "activa" | "dias", valor: boolean | number | null) => {
    setReglas((rs) => rs.map((r) => (r.tipo === tipo ? { ...r, [campo]: valor } : r)));
  };

  const guardar = async () => {
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      await api.put("/alertas/reglas", { reglas });
      setMensaje("Reglas de alertas actualizadas.");
      const res = await api.get<{ alertas: Alerta[] }>("/alertas");
      setAlertas(res.data.alertas);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar las reglas.");
    } finally {
      setEnviando(false);
    }
  };

  const badgeSeveridad = (s: Severidad) => (s === "ALTA" ? "badge-err" : s === "MEDIA" ? "badge-warn" : "badge-mov");

  return (
    <div className="section-card">
      <h3 className="section-title">Alertas y recordatorios</h3>
      {error && <p className="error-msg">{error}</p>}
      {mensaje && <p className="success-msg">{mensaje}</p>}

      {cargando && <p className="count-hint">Cargando alertas...</p>}

      {!cargando && alertas.length === 0 && <p className="count-hint">Sin alertas pendientes.</p>}

      {!cargando && alertas.length > 0 && (
        <ul className={styles.alertaList}>
          {alertas.map((a) => (
            <li key={`${a.entidad}:${a.entidadId}`} className="alerta-item">
              <span className={`badge ${badgeSeveridad(a.severidad)}`}>{ETIQUETAS_SEVERIDAD[a.severidad]}</span>
              <span className={styles.alertaTipo}>{ETIQUETAS_TIPO[a.tipo]}</span>
              <span className="alerta-msg">{a.mensaje}</span>
            </li>
          ))}
        </ul>
      )}

      {!cargando && puedeEditar && (
        <div className={styles.reglasAlerta}>
          <h4>Reglas configurables</h4>
          {reglas.map((r) => (
            <div key={r.tipo} className={styles.reglaAlerta}>
              <label className={styles.reglaCheck}>
                <input
                  type="checkbox"
                  checked={r.activa}
                  onChange={(e) => actualizarRegla(r.tipo, "activa", e.target.checked)}
                />
                {ETIQUETAS_TIPO[r.tipo]}
              </label>
              {requiereDias(r.tipo) && (
                <label className={styles.reglaDias}>
                  Días
                  <input
                    type="number"
                    min="1"
                    value={r.dias ?? ""}
                    onChange={(e) => actualizarRegla(r.tipo, "dias", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </label>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={guardar} disabled={enviando}>
            {enviando ? "Guardando..." : "Guardar reglas"}
          </button>
        </div>
      )}
    </div>
  );
}
