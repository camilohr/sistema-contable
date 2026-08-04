import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const esAdmin = usuario?.rol === "ADMIN";

  const modulos = [
    { nombre: "Comprobantes y asientos", ruta: "/comprobantes" },
    { nombre: "Catálogo de cuentas (PUC)", ruta: "/cuentas" },
    { nombre: "Terceros", ruta: "/terceros" },
    { nombre: "Periodos contables", ruta: "/periodos" },
    { nombre: "Productos e inventario", ruta: "/productos" },
    { nombre: "Activos fijos", ruta: "/activos-fijos" },
    { nombre: "Cuentas por cobrar (CxC)", ruta: "/cxc" },
    { nombre: "Cuentas por pagar (CxP)", ruta: "/cxp" },
    { nombre: "Provisión de cartera", ruta: "/provision-cartera" },
    { nombre: "Indicadores financieros", ruta: "/indicadores" },
    { nombre: "Cierre anual", ruta: "/cierre-anual" },
    { nombre: "Libros y reportes", ruta: "/reportes" },
    ...(esAdmin ? [{ nombre: "Usuarios y roles", ruta: "/usuarios" }] : []),
  ];

  return (
    <div>
      <h2>Bienvenido, {usuario?.nombre}</h2>
      <p className="count-hint">Rol: {usuario?.rol}</p>
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
