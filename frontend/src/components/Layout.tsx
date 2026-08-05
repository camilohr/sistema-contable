import { useEffect } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useEmpresa } from "../context/EmpresaContext";
import styles from "./Layout.module.css";

const rolLabels: Record<string, string> = {
  ADMIN: "Administrador",
  CONTADOR: "Contador",
  AUXILIAR: "Auxiliar",
};

const gruposNavegacion: { titulo: string; items: { to: string; label: string; end?: boolean }[] }[] = [
  {
    titulo: "Proceso",
    items: [
      { to: "", label: "Resumen del proceso", end: true },
      { to: "procesos", label: "Seguimiento por procesos" },
      { to: "periodos", label: "Periodos" },
      { to: "cierre-anual", label: "Cierre anual" },
    ],
  },
  {
    titulo: "Ciclo del mes",
    items: [
      { to: "comprobantes", label: "Comprobantes" },
      { to: "conciliaciones", label: "Conciliación bancaria" },
      { to: "nomina", label: "Nómina" },
      { to: "parametros-nomina", label: "Parámetros de nómina" },
      { to: "provision-cartera", label: "Provisión de cartera" },
      { to: "presupuesto", label: "Presupuesto" },
    ],
  },
  {
    titulo: "Información",
    items: [
      { to: "reportes", label: "Libros y reportes" },
      { to: "cxc", label: "Cuentas por cobrar" },
      { to: "cxp", label: "Cuentas por pagar" },
      { to: "indicadores", label: "Indicadores financieros" },
    ],
  },
  {
    titulo: "Catálogos",
    items: [
      { to: "cuentas", label: "Catálogo de cuentas" },
      { to: "terceros", label: "Terceros" },
      { to: "productos", label: "Productos e inventario" },
      { to: "activos-fijos", label: "Activos fijos" },
      { to: "empleados", label: "Empleados" },
    ],
  },
];

const soloAdmin = [
  { to: "clientes", label: "Clientes", end: true },
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
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>Sistema Contable</div>
        <nav className={styles.sidebarNav}>
          {gruposNavegacion.map((g) => (
            <div key={g.titulo} className={styles.sidebarGrupo}>
              <span className={styles.sidebarGrupoTitulo}>{g.titulo}</span>
              {g.items.map((l) => (
                <NavLink key={l.to} to={`${base}/${l.to}`} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
                  {l.label}
                </NavLink>
              ))}
            </div>
          ))}
          {rol === "ADMIN" && (
            <div className={styles.sidebarGrupo}>
              <span className={styles.sidebarGrupoTitulo}>Administración</span>
              {soloAdmin.map((l) => (
                <NavLink key={l.to} to={`${base}/${l.to}`} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
                  {l.label}
                </NavLink>
              ))}
            </div>
          )}
          <NavLink to="/cambiar-password" end className={({ isActive }) => (isActive ? "active" : "")}>
            Cambiar contraseña
          </NavLink>
        </nav>
      </aside>
      <div className={styles.mainArea}>
        <header className={styles.topbar}>
          {cargando ? (
            <span className={styles.topbarEmpresa}>Cargando empresas...</span>
          ) : (
            <select
              className={styles.empresaSelector}
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
          <div className={styles.topbarUser}>
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
        <main className={styles.content}>
          <Outlet key={empresaId ?? ""} />
        </main>
      </div>
    </div>
  );
}
