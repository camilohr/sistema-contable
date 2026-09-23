import { useNavigate } from "react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarRange,
  ClipboardList,
  Flag,
  LayoutGrid,
  LineChart,
  ListTree,
  Package,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEmpresa } from "../context/EmpresaContext";

export default function Dashboard() {
  const { empresaActiva, esAdmin } = useEmpresa();
  const navigate = useNavigate();
  const base = `/empresa/${empresaActiva?.id ?? ""}`;

  const modulos: { nombre: string; ruta: string; icono: LucideIcon }[] = [
    { nombre: "Comprobantes y asientos", ruta: `${base}/comprobantes`, icono: ClipboardList },
    { nombre: "Catálogo de cuentas (PUC)", ruta: `${base}/cuentas`, icono: ListTree },
    { nombre: "Terceros", ruta: `${base}/terceros`, icono: Users },
    { nombre: "Periodos contables", ruta: `${base}/periodos`, icono: CalendarRange },
    { nombre: "Productos e inventario", ruta: `${base}/productos`, icono: Package },
    { nombre: "Activos fijos", ruta: `${base}/activos-fijos`, icono: Building2 },
    { nombre: "Cuentas por cobrar (CxC)", ruta: `${base}/cxc`, icono: ArrowUpRight },
    { nombre: "Cuentas por pagar (CxP)", ruta: `${base}/cxp`, icono: ArrowDownRight },
    { nombre: "Provisión de cartera", ruta: `${base}/provision-cartera`, icono: ShieldCheck },
    { nombre: "Indicadores financieros", ruta: `${base}/indicadores`, icono: LineChart },
    { nombre: "Seguimiento por procesos", ruta: `${base}/procesos`, icono: LayoutGrid },
    { nombre: "Cierre anual", ruta: `${base}/cierre-anual`, icono: Flag },
    { nombre: "Libros y reportes", ruta: `${base}/reportes`, icono: BookOpen },
    ...(esAdmin ? [{ nombre: "Usuarios y roles", ruta: `${base}/usuarios`, icono: Users }] : []),
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h2>Menú de módulos</h2>
      </div>
      <p className="count-hint">Acceso a los módulos del sistema para la empresa activa.</p>
      <div className="modulos-grid">
        {modulos.map((m) => {
          const Icon = m.icono;
          return (
            <div key={m.nombre} className="modulo-card clickable" onClick={() => navigate(m.ruta)}>
              <span className="modulo-ico">
                <Icon size={18} />
              </span>
              <span>{m.nombre}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
