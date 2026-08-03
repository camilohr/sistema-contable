import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

export default function CambiarPassword() {
  const { usuario } = useAuth();
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setOk("");
    if (passwordNueva.length < 6) {
      setError("La contraseña nueva debe tener al menos 6 caracteres.");
      return;
    }
    if (passwordNueva !== confirmacion) {
      setError("La confirmación no coincide.");
      return;
    }
    setEnviando(true);
    try {
      await api.post("/auth/cambiar-password", { passwordActual, passwordNueva });
      setOk("Contraseña actualizada correctamente.");
      setPasswordActual("");
      setPasswordNueva("");
      setConfirmacion("");
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al cambiar la contraseña.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="page">
      <h2>Cambiar contraseña</h2>
      <p>Usuario: {usuario?.email}</p>
      <form onSubmit={onSubmit} className="form-card">
        <label>
          Contraseña actual
          <input
            type="password"
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          Contraseña nueva
          <input
            type="password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirmar contraseña nueva
          <input
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="error-msg">{error}</p>}
        {ok && <p className="ok-msg">{ok}</p>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? "Guardando..." : "Guardar contraseña"}
          </button>
        </div>
      </form>
    </div>
  );
}
