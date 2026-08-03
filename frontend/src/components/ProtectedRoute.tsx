import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return <div className="cargando">Cargando...</div>;
  if (!usuario) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
