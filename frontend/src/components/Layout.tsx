import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

const rolLabels: Record<string, string> = {
  ADMIN: "Administrador",
  CONTADOR: "Contador",
  AUXILIAR: "Auxiliar",
};

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/cuentas", label: "Catálogo de cuentas" },
  { to: "/cambiar-password", label: "Cambiar contraseña" },
];

export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">Sistema Contable</div>
        <nav className="sidebar-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-user">
            <span>
              {usuario?.nombre} <em>({rolLabels[usuario?.rol ?? ""]})</em>
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Salir
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
