import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import ConfirmModal from "../components/ConfirmModal";
import styles from "./Procesos.module.css";

const ETIQUETAS_ACTIVIDAD: Record<string, string> = {
  COMPROBANTES: "Comprobantes y asientos al día",
  CONCILIACION: "Conciliaciones bancarias",
  NOMINA: "Nómina liquidada y provisionada",
  PROVISION_CARTERA: "Provisión de cartera",
  PRESUPUESTO: "Presupuesto cargado",
  CIERRE_PERIODO: "Cierre de periodos",
  CIERRE_ANIO: "Cierre de año",
};

const ETIQUETAS_ESTADO: Record<string, string> = {
  SIN_INICIAR: "Sin iniciar",
  EN_PROCESO: "En proceso",
  PENDIENTE: "Pendiente",
  AL_DIA: "Al día",
  CERRADO: "Cerrado",
};

interface ProcesoResumen {
  id: string;
  anio: number;
  estado: string;
  avance: { total: number; completadas: number; porcentaje: number };
  notas: number;
  updatedAt: string;
}

interface Actividad {
  id: number;
  tipo: string;
  orden: number;
  estado: boolean;
  fechaEsperada: string | null;
  fechaReal: string | null;
}

interface Nota {
  id: string;
  texto: string;
  createdAt: string;
  usuario: string;
}

interface ProcesoDetalle {
  id: string;
  anio: number;
  estado: string;
  avance: { total: number; completadas: number; porcentaje: number };
  actividades: Actividad[];
  notas: Nota[];
}

function semaforo(porcentaje: number, estado: string) {
  if (estado === "CERRADO" || porcentaje === 100) return { clase: "semaforo-verde", etiqueta: "Al día" };
  if (porcentaje >= 50) return { clase: "semaforo-ambar", etiqueta: "En proceso" };
  return { clase: "semaforo-rojo", etiqueta: "Pendiente" };
}

function fechaBonita(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO");
}

export default function Procesos() {
  const { puedeEditar, esAdmin } = useEmpresa();

  const [procesos, setProcesos] = useState<ProcesoResumen[]>([]);
  const [seleccionado, setSeleccionado] = useState<ProcesoDetalle | null>(null);
  const [anioNuevo, setAnioNuevo] = useState(String(new Date().getFullYear()));
  const [notaTexto, setNotaTexto] = useState("");
  const [estadoNuevo, setEstadoNuevo] = useState("");

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const cargarLista = useCallback(async () => {
    try {
      const res = await api.get<ProcesoResumen[]>("/procesos");
      setProcesos(res.data);
      if (res.data.length > 0) setAnioNuevo(String(Math.max(...res.data.map((p) => p.anio)) + 1));
      return res.data;
    } catch {
      setError("No se pudieron cargar los procesos.");
      return [];
    }
  }, []);

  const cargarDetalle = useCallback(async (id: string) => {
    try {
      const res = await api.get<ProcesoDetalle>(`/procesos/${id}`);
      setSeleccionado(res.data);
      setEstadoNuevo(res.data.estado);
    } catch {
      setError("No se pudo cargar el detalle del proceso.");
    }
  }, []);

  const recargar = useCallback(
    async (id?: string) => {
      const lista = await cargarLista();
      const objetivo = id ?? seleccionado?.id ?? lista[0]?.id;
      if (objetivo) await cargarDetalle(objetivo);
    },
    [cargarLista, cargarDetalle, seleccionado?.id]
  );

  useEffect(() => {
    cargarLista()
      .then((lista) => {
        if (lista.length > 0) return cargarDetalle(lista[0].id);
      })
      .finally(() => setCargando(false));
  }, [cargarLista, cargarDetalle]);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      const res = await api.post<ProcesoDetalle>("/procesos", { anio: Number(anioNuevo) });
      setMensaje(`Proceso del año ${res.data.anio} creado con su plantilla de actividades.`);
      await recargar(res.data.id);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al crear el proceso.");
    } finally {
      setEnviando(false);
    }
  };

  const marcarActividad = async (actividad: Actividad, estado: boolean) => {
    if (!seleccionado) return;
    setError("");
    try {
      const res = await api.patch<Actividad>(`/procesos/${seleccionado.id}/actividades/${actividad.id}`, {
        estado: !actividad.estado ? true : estado,
      });
      setSeleccionado({
        ...seleccionado,
        actividades: seleccionado.actividades.map((a) => (a.id === actividad.id ? { ...a, ...res.data } : a)),
      });
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al actualizar la actividad.");
    }
  };

  const cambiarEstado = async () => {
    if (!seleccionado || !estadoNuevo) return;
    setError("");
    try {
      const res = await api.patch<ProcesoResumen>(`/procesos/${seleccionado.id}`, { estado: estadoNuevo });
      setSeleccionado({ ...seleccionado, estado: res.data.estado });
      await cargarLista();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al actualizar el estado.");
    }
  };

  const agregarNota = async (e: FormEvent) => {
    e.preventDefault();
    if (!seleccionado || !notaTexto.trim()) return;
    setError("");
    setEnviando(true);
    try {
      await api.post(`/procesos/${seleccionado.id}/notas`, { texto: notaTexto.trim() });
      setNotaTexto("");
      setMensaje("Nota de seguimiento agregada.");
      await cargarDetalle(seleccionado.id);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al agregar la nota.");
    } finally {
      setEnviando(false);
    }
  };

  const eliminar = async () => {
    if (!seleccionado) return;
    setConfirmarEliminar(false);
    setError("");
    try {
      await api.delete(`/procesos/${seleccionado.id}`);
      setSeleccionado(null);
      setMensaje("Proceso eliminado.");
      await cargarLista();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al eliminar el proceso.");
    }
  };

  const s = seleccionado ? semaforo(seleccionado.avance.porcentaje, seleccionado.estado) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Seguimiento contable por proceso</h2>
          <p className="count-hint">Avance de las obligaciones contables por año.</p>
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {mensaje && <p className="success-msg">{mensaje}</p>}

      {cargando && <p className="count-hint">Cargando...</p>}

      {!cargando && (
        <div className="section-card">
          <h3 className="section-title">Procesos por año</h3>
          {procesos.length === 0 && <p className="count-hint">Aún no hay procesos. Cree el del año en curso para empezar el seguimiento.</p>}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Estado</th>
                  <th>Avance</th>
                  <th>Semáforo</th>
                  <th className="num-cell">Notas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {procesos.map((p) => {
                  const t = semaforo(p.avance.porcentaje, p.estado);
                  return (
                    <tr key={p.id} className={seleccionado?.id === p.id ? styles.filaActiva : ""}>
                      <td className="mono">{p.anio}</td>
                      <td>{ETIQUETAS_ESTADO[p.estado] ?? p.estado}</td>
                      <td>
                        <div className="proceso-barra">
                          <span className="count-hint">
                            {p.avance.completadas}/{p.avance.total} ({p.avance.porcentaje}%)
                          </span>
                          <div className="proceso-bar">
                            <div className="proceso-bar-fill" style={{ width: `${p.avance.porcentaje}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={t.clase}>
                          <span className="semaforo-dot" /> {t.etiqueta}
                        </span>
                      </td>
                      <td className="num-cell">{p.notas}</td>
                      <td className="acciones">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => cargarDetalle(p.id)}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {puedeEditar && (
            <form onSubmit={crear} className="form-row">
              <label>
                Nuevo proceso año
                <input type="number" min="2000" max="2100" value={anioNuevo} onChange={(e) => setAnioNuevo(e.target.value)} required />
              </label>
              <button type="submit" className="btn btn-primary" disabled={enviando}>
                {enviando ? "Creando..." : "Crear proceso"}
              </button>
            </form>
          )}
        </div>
      )}

      {seleccionado && s && (
        <div className="section-card">
          <h3 className="section-title">
            Proceso {seleccionado.anio} · <span className={s.clase}><span className="semaforo-dot" /> {s.etiqueta}</span>{" "}
            <span className="muted">({ETIQUETAS_ESTADO[seleccionado.estado] ?? seleccionado.estado})</span>
          </h3>

          <div className={styles.checklist}>
            {seleccionado.actividades.map((a) => (
              <div key={a.id} className={`${styles.checkItem}${a.estado ? " hecho" : ""}`}>
                <span className={styles.checkNum}>{a.estado ? "✓" : a.orden}</span>
                <span className={styles.checkNombre}>
                  {ETIQUETAS_ACTIVIDAD[a.tipo] ?? a.tipo}
                  {a.fechaEsperada && <span className={styles.checkFecha}> · esperada {a.fechaEsperada}</span>}
                  {a.fechaReal && <span className={styles.checkFecha}> · completada {fechaBonita(a.fechaReal)}</span>}
                </span>
                {puedeEditar && (
                  <button type="button" className={`btn btn-sm ${a.estado ? "btn-secondary" : "btn-primary"}`} onClick={() => marcarActividad(a, !a.estado)}>
                    {a.estado ? "Desmarcar" : "Completar"}
                  </button>
                )}
              </div>
            ))}
          </div>

          {puedeEditar && (
            <div className="form-row">
              <select value={estadoNuevo} onChange={(e) => setEstadoNuevo(e.target.value)}>
                {Object.entries(ETIQUETAS_ESTADO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" onClick={cambiarEstado}>
                Cambiar estado
              </button>
              {esAdmin && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmarEliminar(true)}>
                  Eliminar
                </button>
              )}
            </div>
          )}

          <div className={styles.notasSeguimiento}>
            <h4>Notas de seguimiento</h4>
            {seleccionado.notas.length === 0 && <p className="count-hint">Sin notas registradas.</p>}
            {seleccionado.notas.map((n) => (
              <div key={n.id} className="alerta-item">
                <p className="alerta-msg">{n.texto}</p>
                <p className="count-hint">
                  {n.usuario} · {fechaBonita(n.createdAt)}
                </p>
              </div>
            ))}
            {puedeEditar && (
              <form onSubmit={agregarNota} className="form-row">
                <input type="text" placeholder="Agregar nota de seguimiento..." value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)} />
                <button type="submit" className="btn btn-primary" disabled={enviando || !notaTexto.trim()}>
                  Agregar
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {confirmarEliminar && seleccionado && (
        <ConfirmModal
          titulo="Eliminar proceso"
          mensaje={`¿Eliminar el proceso del año ${seleccionado.anio}? Esta acción no se puede revertir.`}
          textoConfirmar="Eliminar"
          onConfirmar={eliminar}
          onCancelar={() => setConfirmarEliminar(false)}
        />
      )}
    </div>
  );
}
