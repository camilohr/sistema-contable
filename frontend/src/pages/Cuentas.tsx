import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
  nivel: number;
  clase: number;
  naturaleza: string;
  permiteMovimiento: boolean;
  afectaResultado: boolean;
  requiereTercero: boolean;
  activa: boolean;
  tieneHijas: boolean;
}

const naturalezaLabel: Record<string, string> = { DEUDORA: "Deudora", ACREEDORA: "Acreedora" };

export default function Cuentas() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "ADMIN" || usuario?.rol === "CONTADOR";

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [clase, setClase] = useState("");
  const [soloMovimiento, setSoloMovimiento] = useState(false);

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Cuenta | null>(null);
  const [eliminando, setEliminando] = useState<Cuenta | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.set("busqueda", busqueda.trim());
      if (clase) params.set("clase", clase);
      if (soloMovimiento) params.set("soloMovimiento", "true");
      const res = await api.get<Cuenta[]>(`/cuentas${params.toString() ? `?${params}` : ""}`);
      setCuentas(res.data);
    } catch {
      setError("No se pudo cargar el catálogo de cuentas.");
    } finally {
      setCargando(false);
    }
  }, [busqueda, clase, soloMovimiento]);

  useEffect(() => {
    const t = setTimeout(() => cargar(), busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  const agrupadas = useMemo(() => {
    const porNivel = (n: number) => cuentas.filter((c) => c.nivel === n).length;
    return { porNivel, total: cuentas.length };
  }, [cuentas]);

  return (
    <div className="page">
      <div className="page-head">
        <h2>Catálogo de cuentas (PUC)</h2>
        {puedeEditar && (
          <button className="btn btn-primary" onClick={() => setCreando(true)}>
            Nueva cuenta
          </button>
        )}
      </div>

      <div className="filters">
        <input
          className="filter-input"
          type="search"
          placeholder="Buscar código o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={clase} onChange={(e) => setClase(e.target.value)} className="filter-input">
          <option value="">Todas las clases</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
            <option key={c} value={c}>
              Clase {c}
            </option>
          ))}
        </select>
        <label className="filter-check">
          <input type="checkbox" checked={soloMovimiento} onChange={(e) => setSoloMovimiento(e.target.checked)} />
          Solo cuentas de movimiento
        </label>
      </div>

      {agrupadas.total > 0 && (
        <p className="count-hint">
          {agrupadas.total} cuenta{agrupadas.total === 1 ? "" : "s"} encontrada{agrupadas.total === 1 ? "" : "s"}
        </p>
      )}

      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}

      {!cargando && cuentas.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && cuentas.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Nivel</th>
                <th>Naturaleza</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.id} className={!c.activa ? "inactiva" : ""}>
                  <td className="codigo-cell" style={{ paddingLeft: `${c.nivel * 14}px` }}>
                    {c.codigo}
                  </td>
                  <td>{c.nombre}</td>
                  <td>{c.nivel}</td>
                  <td>
                    <span className={`badge badge-${c.naturaleza.toLowerCase()}`}>{naturalezaLabel[c.naturaleza]}</span>
                  </td>
                  <td>
                    {c.permiteMovimiento && <span className="badge badge-mov">Movimiento</span>}
                    {!c.activa && <span className="badge badge-err">Inactiva</span>}
                    {c.requiereTercero && <span className="badge badge-terc">Tercero</span>}
                  </td>
                  <td className="acciones">
                    {puedeEditar && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditando(c)}>
                          Editar
                        </button>
                        {!c.tieneHijas && (
                          <button className="btn btn-secondary btn-sm btn-danger" onClick={() => setEliminando(c)}>
                            Eliminar
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <FormaNuevaCuenta onClose={() => setCreando(false)} onCreada={() => { setCreando(false); cargar(); }} />}
      {editando && <FormaEditarCuenta cuenta={editando} onClose={() => setEditando(null)} onGuardada={() => { setEditando(null); cargar(); }} />}
      {eliminando && <ConfirmarEliminar cuenta={eliminando} onClose={() => setEliminando(null)} onEliminada={() => { setEliminando(null); cargar(); }} />}
    </div>
  );
}

function FormaNuevaCuenta({ onClose, onCreada }: { onClose: () => void; onCreada: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [requiereTercero, setRequiereTercero] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.post("/cuentas", { codigo, nombre, requiereTercero });
      onCreada();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al crear la cuenta.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Nueva cuenta</h3>
        <form onSubmit={onSubmit} className="form-card">
          <label>
            Código (1, 2, 4, 6 u 8 dígitos)
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required placeholder="Ej: 11050501" />
          </label>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={requiereTercero} onChange={(e) => setRequiereTercero(e.target.checked)} />
            Requiere tercero
          </label>
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

function FormaEditarCuenta({ cuenta, onClose, onGuardada }: { cuenta: Cuenta; onClose: () => void; onGuardada: () => void }) {
  const [nombre, setNombre] = useState(cuenta.nombre);
  const [activa, setActiva] = useState(cuenta.activa);
  const [requiereTercero, setRequiereTercero] = useState(cuenta.requiereTercero);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.patch(`/cuentas/${cuenta.id}`, { nombre, activa, requiereTercero });
      onGuardada();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al guardar la cuenta.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>
          Editar cuenta <span className="muted">{cuenta.codigo}</span>
        </h3>
        <form onSubmit={onSubmit} className="form-card">
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
            Activa
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={requiereTercero} onChange={(e) => setRequiereTercero(e.target.checked)} />
            Requiere tercero
          </label>
          {error && <p className="error-msg">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmarEliminar({ cuenta, onClose, onEliminada }: { cuenta: Cuenta; onClose: () => void; onEliminada: () => void }) {
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const eliminar = async () => {
    setError("");
    setEnviando(true);
    try {
      await api.delete(`/cuentas/${cuenta.id}`);
      onEliminada();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al eliminar la cuenta.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Eliminar cuenta</h3>
        <p>
          ¿Eliminar la cuenta <strong>{cuenta.codigo} - {cuenta.nombre}</strong>?
        </p>
        {error && <p className="error-msg">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-danger" onClick={eliminar} disabled={enviando}>
            {enviando ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
