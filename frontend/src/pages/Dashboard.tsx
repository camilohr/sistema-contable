import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

const modulos = [
  { nombre: "Catálogo de cuentas (PUC)", ruta: "/cuentas", disponible: true },
  { nombre: "Terceros", ruta: "/terceros", disponible: true },
  { nombre: "Usuarios y roles", ruta: null, disponible: false },
  { nombre: "Comprobantes y asientos", ruta: null, disponible: false },
  { nombre: "Libros y reportes", ruta: null, disponible: false },
  { nombre: "Estados financieros", ruta: null, disponible: false },
  { nombre: "CxC / CxP", ruta: null, disponible: false },
  { nombre: "Inventario", ruta: null, disponible: false },
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
