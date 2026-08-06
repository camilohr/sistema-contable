import { useEffect } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Building2,
  CalendarRange,
  FileText,
  Flag,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LineChart,
  ListTree,
  LogOut,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useEmpresa } from "../context/EmpresaContext";
import { Button } from "./ui";
import styles from "./Layout.module.css";

const rolLabels: Record<string, string> = {
  ADMIN: "Administrador",
  CONTADOR: "Contador",
  AUXILIAR: "Auxiliar",
};

type ItemNav = { to: string; label: string; icon: LucideIcon; end?: boolean };

const gruposNavegacion: { titulo: string; items: ItemNav[] }[] = [
  {
    titulo: "Proceso",
    items: [
      { to: "", label: "Resumen del proceso", icon: LayoutDashboard, end: true },
      { to: "procesos", label: "Seguimiento por procesos", icon: Activity },
      { to: "periodos", label: "Periodos", icon: CalendarRange },
      { to: "cierre-anual", label: "Cierre anual", icon: Flag },
    ],
  },
  {
    titulo: "Ciclo del mes",
    items: [
      { to: "comprobantes", label: "Comprobantes", icon: FileText },
      { to: "conciliaciones", label: "Conciliación bancaria", icon: Landmark },
      { to: "nomina", label: "Nómina", icon: Wallet },
      { to: "parametros-nomina", label: "Parámetros de nómina", icon: SlidersHorizontal },
      { to: "provision-cartera", label: "Provisión de cartera", icon: ShieldCheck },
      { to: "presupuesto", label: "Presupuesto", icon: Target },
    ],
  },
  {
    titulo: "Información",
    items: [
      { to: "reportes", label: "Libros y reportes", icon: BookOpen },
      { to: "cxc", label: "Cuentas por cobrar", icon: ArrowUpRight },
      { to: "cxp", label: "Cuentas por pagar", icon: ArrowDownRight },
      { to: "indicadores", label: "Indicadores financieros", icon: LineChart },
    ],
  },
  {
    titulo: "Catálogos",
    items: [
      { to: "cuentas", label: "Catálogo de cuentas", icon: ListTree },
      { to: "terceros", label: "Terceros", icon: Users },
      { to: "productos", label: "Productos e inventario", icon: Package },
      { to: "activos-fijos", label: "Activos fijos", icon: Building2 },
      { to: "empleados", label: "Empleados", icon: Briefcase },
    ],
  },
];

const soloAdmin: ItemNav[] = [
  { to: "clientes", label: "Clientes", icon: Users, end: true },
  { to: "usuarios", label: "Usuarios", icon: UserCog, end: true },
  { to: "auditoria", label: "Bitácora de auditoría", icon: History, end: true },
];

function Enlace({ item, base }: { item: ItemNav; base: string }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={`${base}/${item.to}`}
      end={item.end}
      className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
    >
      <Icon size={17} strokeWidth={2} className={styles.navIcon} />
      <span>{item.label}</span>
    </NavLink>
  );
}

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
        <div className={styles.sidebarBrand}>
          <span className={styles.brandIcon}>
            <Landmark size={20} strokeWidth={2.2} />
          </span>
          <span>Sistema Contable</span>
        </div>
        <nav className={styles.sidebarNav}>
          {gruposNavegacion.map((g) => (
            <div key={g.titulo} className={styles.sidebarGrupo}>
              <span className={styles.sidebarGrupoTitulo}>{g.titulo}</span>
              {g.items.map((l) => (
                <Enlace key={l.to} item={l} base={base} />
              ))}
            </div>
          ))}
          {rol === "ADMIN" && (
            <div className={styles.sidebarGrupo}>
              <span className={styles.sidebarGrupoTitulo}>Administración</span>
              {soloAdmin.map((l) => (
                <Enlace key={l.to} item={l} base={base} />
              ))}
            </div>
          )}
          <div className={styles.sidebarGrupo}>
            <span className={styles.sidebarGrupoTitulo}>Sesión</span>
            <NavLink to="/cambiar-password" end className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}>
              <KeyRound size={17} strokeWidth={2} className={styles.navIcon} />
              <span>Cambiar contraseña</span>
            </NavLink>
          </div>
        </nav>
        <div className={styles.sidebarFooter}>
          <span className={styles.sidebarRol}>{rolLabels[rol ?? ""] ?? ""}</span>
        </div>
      </aside>
      <div className={styles.mainArea}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
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
                aria-label="Empresa activa"
              >
                {empresas.length === 0 && <option value="">Sin empresas</option>}
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className={styles.topbarUser}>
            <div className={styles.userChip}>
              <span className={styles.userName}>{usuario?.nombre}</span>
              <span className={styles.roleBadge}>{rolLabels[rol ?? ""] ?? ""}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut size={15} />
              Salir
            </Button>
          </div>
        </header>
        <main className={styles.content}>
          <Outlet key={empresaId ?? ""} />
        </main>
      </div>
    </div>
  );
}
