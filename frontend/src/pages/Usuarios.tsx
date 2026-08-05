import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

type Rol = "ADMIN" | "CONTADOR" | "AUXILIAR";

interface UsuarioEmpresa {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
  createdAt: string;
}

interface UsuarioDisponible {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

export default function Usuarios() {
  const { usuario } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioEmpresa[]>([]);
  const [disponibles, setDisponibles] = useState<UsuarioDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [asignando, setAsignando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await api.get<UsuarioEmpresa[]>("/usuarios");
      setUsuarios(res.data);
      const disp = await api.get<UsuarioDisponible[]>("/usuarios/disponibles");
      setDisponibles(disp.data);
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

  const cambiarRol = async (u: UsuarioEmpresa, rol: Rol) => {
    if (rol === u.rol) return;
    setError("");
    try {
      await api.patch(`/usuarios/${u.id}/rol`, { rol });
      await cargar();
    } catch {
      setError("No se pudo cambiar el rol del usuario.");
    }
  };

  const retirar = async (u: UsuarioEmpresa) => {
    if (!window.confirm(`¿Retirar a "${u.nombre}" de esta empresa? Perderá el acceso.`)) return;
    setError("");
    try {
      await api.delete(`/usuarios/${u.id}`);
      await cargar();
    } catch {
      setError("No se pudo retirar al usuario.");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Usuarios de la empresa</h2>
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
                <th>Rol en la empresa</th>
                <th>Estado</th>
                <th>Contraseña</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={!u.activo ? "inactiva" : ""}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      className="filter-input"
                      value={u.rol}
                      onChange={(e) => cambiarRol(u, e.target.value as Rol)}
                      disabled={u.id === usuario.id}
                      title={u.id === usuario.id ? "No puede modificar su propio rol" : "Cambiar rol en esta empresa"}
                    >
                      <option value="CONTADOR">Contador</option>
                      <option value="AUXILIAR">Auxiliar</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </td>
                  <td>
                    {u.activo ? <span className="badge badge-mov">Activo</span> : <span className="badge badge-err">Inactivo</span>}
                  </td>
                  <td>
                    {u.debeCambiarPassword ? <span className="badge badge-warn">Pendiente de cambio</span> : <span className="muted">Actualizada</span>}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => retirar(u)}
                      disabled={u.id === usuario.id}
                      title={u.id === usuario.id ? "No puede retirarse a sí mismo" : "Retirar de esta empresa"}
                    >
                      Retirar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && (
        <button className="btn btn-secondary" onClick={() => setAsignando(true)} disabled={disponibles.length === 0}>
          {disponibles.length === 0 ? "No hay usuarios disponibles para asignar" : "Asignar usuario existente"}
        </button>
      )}

      {creando && <FormaUsuario onClose={() => setCreando(false)} onGuardado={() => { setCreando(false); cargar(); }} />}
      {asignando && (
        <FormaAsignar
          disponibles={disponibles}
          onClose={() => setAsignando(false)}
          onAsignado={() => { setAsignando(false); cargar(); }}
        />
      )}
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
            Rol en la empresa
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

function FormaAsignar({
  disponibles,
  onClose,
  onAsignado,
}: {
  disponibles: UsuarioDisponible[];
  onClose: () => void;
  onAsignado: () => void;
}) {
  const [usuarioId, setUsuarioId] = useState(disponibles[0]?.id ?? "");
  const [rol, setRol] = useState<Rol>("CONTADOR");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!usuarioId) return;
    setError("");
    setEnviando(true);
    try {
      await api.post(`/usuarios/${usuarioId}/vincular`, { rol });
      onAsignado();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo asignar el usuario.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Asignar usuario a esta empresa</h3>
        <form onSubmit={onSubmit} className="form-card">
          <label>
            Usuario
            <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} required>
              {disponibles.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label>
            Rol en la empresa
            <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="CONTADOR">Contador</option>
              <option value="AUXILIAR">Auxiliar</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          {error && <p className="error-msg">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando || !usuarioId}>
              {enviando ? "Asignando..." : "Asignar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
