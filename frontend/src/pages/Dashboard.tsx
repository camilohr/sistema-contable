import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

const modulos = [
  { nombre: "Comprobantes y asientos", ruta: "/comprobantes", disponible: true },
  { nombre: "Catálogo de cuentas (PUC)", ruta: "/cuentas", disponible: true },
  { nombre: "Terceros", ruta: "/terceros", disponible: true },
  { nombre: "Periodos contables", ruta: "/periodos", disponible: true },
  { nombre: "Usuarios y roles", ruta: null, disponible: false },
  { nombre: "Libros y reportes", ruta: "/reportes", disponible: true },
  { nombre: "Estados financieros", ruta: "/reportes", disponible: true },
  { nombre: "CxC / CxP e inventario", ruta: null, disponible: false },
];

export default function Dashboard() {
  const { usuario } = useAuth();
  const navigate = useNavigate();

  return (
    <div>
      <h2>Bienvenido, {usuario?.nombre}</h2>
      <p>Los módulos del sistema se habilitarán a medida que se completen las fases de desarrollo.</p>
      <div className="modulos-grid">
        {modulos.map((m) => (
          <div
            key={m.nombre}
            className={`modulo-card ${m.disponible ? "" : "disabled"} ${m.ruta ? "clickable" : ""}`}
            onClick={() => m.ruta && navigate(m.ruta)}
          >
            <span className="modulo-ico">{m.disponible ? "✓" : "🔒"}</span>
            <span>{m.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
