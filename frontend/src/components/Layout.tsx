import { useEffect } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useEmpresa } from "../context/EmpresaContext";

const rolLabels: Record<string, string> = {
  ADMIN: "Administrador",
  CONTADOR: "Contador",
  AUXILIAR: "Auxiliar",
};

const links = [
  { to: "", label: "Dashboard", end: true },
  { to: "comprobantes", label: "Comprobantes" },
  { to: "reportes", label: "Libros y reportes" },
  { to: "cxc", label: "Cuentas por cobrar" },
  { to: "cxp", label: "Cuentas por pagar" },
  { to: "provision-cartera", label: "Provisión de cartera" },
  { to: "indicadores", label: "Indicadores financieros" },
  { to: "procesos", label: "Seguimiento por procesos" },
  { to: "presupuesto", label: "Presupuesto" },
  { to: "productos", label: "Productos e inventario" },
  { to: "activos-fijos", label: "Activos fijos" },
  { to: "empleados", label: "Empleados" },
  { to: "nomina", label: "Nómina" },
  { to: "parametros-nomina", label: "Parámetros de nómina" },
  { to: "cierre-anual", label: "Cierre anual" },
  { to: "cuentas", label: "Catálogo de cuentas" },
  { to: "terceros", label: "Terceros" },
  { to: "periodos", label: "Periodos" },
  { to: "/cambiar-password", label: "Cambiar contraseña", end: true },
];

const soloAdmin = [
  { to: "usuarios", label: "Usuarios", end: true },
  { to: "auditoria", label: "Bitácora de auditoría", end: true },
];

export default function Layout() {
  const { usuario, logout } = useAuth();
  const { empresas, empresaActiva, cargando, seleccionarEmpresa } = useEmpresa();
  const navigate = useNavigate();
  const { empresaId } = useParams();

  useEffect(() => {
    if (empresaId && empresaId !== empresaActiva?.id && empresas.some((e) => e.id === empresaId)) {
      seleccionarEmpresa(empresaId);
    }
  }, [empresaId, empresas, empresaActiva, seleccionarEmpresa]);

  const rol = empresaActiva?.rol ?? usuario?.rol;
  const base = `/empresa/${empresaActiva?.id ?? ""}`;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">Sistema Contable</div>
        <nav className="sidebar-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to.startsWith("/") ? l.to : `${base}/${l.to}`} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
              {l.label}
            </NavLink>
          ))}
          {rol === "ADMIN" &&
            soloAdmin.map((l) => (
              <NavLink key={l.to} to={`${base}/${l.to}`} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
                {l.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="topbar">
          {cargando ? (
            <span className="topbar-empresa">Cargando empresas...</span>
          ) : (
            <select
              className="empresa-selector"
              value={empresaActiva?.id ?? ""}
              onChange={(e) => {
                seleccionarEmpresa(e.target.value);
                navigate(`/empresa/${e.target.value}`);
              }}
            >
              {empresas.length === 0 && <option value="">Sin empresas</option>}
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre}
                </option>
              ))}
            </select>
          )}
          <div className="topbar-user">
            <span>
              {usuario?.nombre} <em>({rolLabels[rol ?? ""]})</em>
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
          <Outlet key={empresaId ?? ""} />
        </main>
      </div>
    </div>
  );
}
