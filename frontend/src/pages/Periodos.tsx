import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

interface Periodo {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado: "ABIERTO" | "CERRADO";
  _count?: { comprobantes: number };
}

const d = (iso: string) => iso.slice(0, 10);

export default function Periodos() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "ADMIN" || usuario?.rol === "CONTADOR";

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await api.get<Periodo[]>("/periodos");
      setPeriodos(res.data);
    } catch {
      setError("No se pudieron cargar los periodos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarEstado = async (p: Periodo, nuevo: "ABIERTO" | "CERRADO") => {
    setError("");
    try {
      await api.patch(`/periodos/${p.id}`, { estado: nuevo });
      cargar();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al actualizar el periodo.");
    }
  };

  const eliminar = async (p: Periodo) => {
    setError("");
    try {
      await api.delete(`/periodos/${p.id}`);
      cargar();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al eliminar el periodo.");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Periodos contables</h2>
        {puedeEditar && (
          <button className="btn btn-primary" onClick={() => setCreando(true)}>
            Nuevo periodo
          </button>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}

      {!cargando && periodos.length === 0 && <p className="count-hint">No hay periodos creados.</p>}

      {!cargando && periodos.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th>Estado</th>
                <th>Comprobantes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.id}>
                  <td className="codigo-cell">{p.nombre}</td>
                  <td>{d(p.fechaInicio)}</td>
                  <td>{d(p.fechaFin)}</td>
                  <td>
                    {p.estado === "ABIERTO" ? (
                      <span className="badge badge-mov">Abierto</span>
                    ) : (
                      <span className="badge badge-err">Cerrado</span>
                    )}
                  </td>
                  <td>{p._count?.comprobantes ?? 0}</td>
                  <td className="acciones">
                    {puedeEditar && (
                      <>
                        {p.estado === "ABIERTO" ? (
                          <button className="btn btn-secondary btn-sm" onClick={() => cambiarEstado(p, "CERRADO")}>
                            Cerrar
                          </button>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => cambiarEstado(p, "ABIERTO")}>
                            Abrir
                          </button>
                        )}
                        <button
                          className="btn btn-secondary btn-sm btn-danger"
                          onClick={() => eliminar(p)}
                          disabled={!!p._count?.comprobantes}
                          title={p._count?.comprobantes ? "Tiene comprobantes, no se puede eliminar" : ""}
                        >
                          Eliminar
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

      {creando && <FormaNuevoPeriodo onClose={() => setCreando(false)} onCreado={() => { setCreando(false); cargar(); }} />}
    </div>
  );
}

function FormaNuevoPeriodo({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.post("/periodos", { nombre, fechaInicio, fechaFin });
      onCreado();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al crear el periodo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Nuevo periodo</h3>
        <form onSubmit={onSubmit} className="form-card">
          <label>
            Nombre (ej. 2026-08)
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="2026-08" />
          </label>
          <div className="form-row">
            <label>
              Fecha inicio
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
            </label>
            <label>
              Fecha fin
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} required />
            </label>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? "Creando..." : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
