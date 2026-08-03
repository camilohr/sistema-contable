import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";

export type Rol = "ADMIN" | "CONTADOR" | "AUXILIAR";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

interface AuthContextType {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setCargando(false);
      return;
    }
    api
      .get<Usuario>("/auth/me")
      .then((res) => setUsuario(res.data))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setCargando(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; usuario: Usuario }>("/auth/login", { email, password });
    localStorage.setItem("token", res.data.token);
    setUsuario(res.data.usuario);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
