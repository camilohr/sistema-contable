import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

interface UsuarioAdmin {
  id: string;
  nombre: string;
  email: string;
  rol: "ADMIN" | "CONTADOR" | "AUXILIAR";
  activo: boolean;
  debeCambiarPassword: boolean;
  createdAt: string;
}

const rolLabels: Record<string, string> = { ADMIN: "Administrador", CONTADOR: "Contador", AUXILIAR: "Auxiliar" };

export default function Usuarios() {
  const { usuario } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await api.get<UsuarioAdmin[]>("/usuarios");
      setUsuarios(res.data);
    } catch {
      setError("No se pudieron cargar los usuarios.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (usuario?.rol !== "ADMIN") {
    return (
      <div className="page">
        <h2>Usuarios</h2>
        <p className="error-msg">Solo el administrador puede gestionar usuarios.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Usuarios</h2>
        <button className="btn btn-primary" onClick={() => setCreando(true)}>
          Nuevo usuario
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && usuarios.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && usuarios.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Contraseña</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={!u.activo ? "inactiva" : ""}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>{rolLabels[u.rol]}</td>
                  <td>
                    {u.activo ? <span className="badge badge-mov">Activo</span> : <span className="badge badge-err">Inactivo</span>}
                  </td>
                  <td>
                    {u.debeCambiarPassword ? <span className="badge badge-warn">Pendiente de cambio</span> : <span className="muted">Actualizada</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <FormaUsuario onClose={() => setCreando(false)} onGuardado={() => { setCreando(false); cargar(); }} />}
    </div>
  );
}

function FormaUsuario({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [form, setForm] = useState({ nombre: "", email: "", rol: "CONTADOR", password: "" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const set = (campo: string, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.post("/usuarios", form);
      onGuardado();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar el usuario.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Nuevo usuario</h3>
        <form onSubmit={onSubmit} className="form-card">
          <label>
            Nombre
            <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
          </label>
          <label>
            Correo electrónico
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="correo@empresa.com" />
          </label>
          <label>
            Rol
            <select value={form.rol} onChange={(e) => set("rol", e.target.value)}>
              <option value="CONTADOR">Contador</option>
              <option value="AUXILIAR">Auxiliar</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          <label>
            Contraseña inicial
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>
          <p className="count-hint">El usuario deberá cambiar esta contraseña en su primer ingreso.</p>
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
