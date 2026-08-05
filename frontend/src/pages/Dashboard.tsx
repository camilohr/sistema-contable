import { useNavigate } from "react-router";
import { useEmpresa } from "../context/EmpresaContext";

export default function Dashboard() {
  const { empresaActiva } = useEmpresa();
  const navigate = useNavigate();
  const esAdmin = empresaActiva?.rol === "ADMIN";
  const base = `/empresa/${empresaActiva?.id ?? ""}`;

  const modulos = [
    { nombre: "Comprobantes y asientos", ruta: `${base}/comprobantes` },
    { nombre: "Catálogo de cuentas (PUC)", ruta: `${base}/cuentas` },
    { nombre: "Terceros", ruta: `${base}/terceros` },
    { nombre: "Periodos contables", ruta: `${base}/periodos` },
    { nombre: "Productos e inventario", ruta: `${base}/productos` },
    { nombre: "Activos fijos", ruta: `${base}/activos-fijos` },
    { nombre: "Cuentas por cobrar (CxC)", ruta: `${base}/cxc` },
    { nombre: "Cuentas por pagar (CxP)", ruta: `${base}/cxp` },
    { nombre: "Provisión de cartera", ruta: `${base}/provision-cartera` },
    { nombre: "Indicadores financieros", ruta: `${base}/indicadores` },
    { nombre: "Seguimiento por procesos", ruta: `${base}/procesos` },
    { nombre: "Cierre anual", ruta: `${base}/cierre-anual` },
    { nombre: "Libros y reportes", ruta: `${base}/reportes` },
    ...(esAdmin ? [{ nombre: "Usuarios y roles", ruta: `${base}/usuarios` }] : []),
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h2>Menú de módulos</h2>
      </div>
      <p className="count-hint">Acceso a los módulos del sistema para la empresa activa.</p>
      <div className="modulos-grid">
        {modulos.map((m) => (
          <div key={m.nombre} className="modulo-card clickable" onClick={() => navigate(m.ruta)}>
            <span className="modulo-ico">✓</span>
            <span>{m.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
