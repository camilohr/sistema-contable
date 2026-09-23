import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import type { Rol } from "../context/AuthContext";

interface Props {
  children: ReactNode;
  roles?: Rol[];
}

export default function ProtectedRoute({ children, roles }: Props) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <div className="cargando">Cargando...</div>;
  if (!usuario) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  if (usuario.debeCambiarPassword && location.pathname !== "/cambiar-password") {
    return <Navigate to="/cambiar-password" replace />;
  }
  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
