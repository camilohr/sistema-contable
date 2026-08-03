import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <div className="cargando">Cargando...</div>;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.debeCambiarPassword && location.pathname !== "/cambiar-password") {
    return <Navigate to="/cambiar-password" replace />;
  }
  return <>{children}</>;
}
