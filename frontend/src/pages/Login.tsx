import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Landmark } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Field, TextInput } from "../components/ui";
import styles from "./Login.module.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const u = await login(email, password);
      const ret = searchParams.get("returnTo");
      navigate(u.debeCambiarPassword ? "/cambiar-password" : ret || "/", { replace: true });
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al iniciar sesión. Verifica la conexión con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginCard}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>
            <Landmark size={26} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className={styles.loginTitle}>Sistema Contable</h1>
          </div>
        </div>
        <p className={styles.loginSubtitle}>Inicie sesión para continuar</p>
        <form onSubmit={onSubmit} className={styles.loginForm}>
          <Field label="Correo electrónico" htmlFor="login-email">
            <TextInput
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              autoFocus
            />
          </Field>
          <Field label="Contraseña" htmlFor="login-password">
            <TextInput
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          {error && <p className="error-msg">{error}</p>}
          <Button type="submit" loading={enviando}>
            {enviando ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
