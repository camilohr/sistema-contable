import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

const modulos = [
  "Usuarios y roles",
  "Catálogo de cuentas (PUC)",
  "Terceros",
  "Comprobantes y asientos",
  "Libros y reportes",
  "Estados financieros",
  "CxC / CxP",
  "Inventario",
];

const rolLabels: Record<string, string> = {
  ADMIN: "Administrador",
  CONTADOR: "Contador",
  AUXILIAR: "Auxiliar",
};

export default function Dashboard() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Sistema Contable</h1>
        <div className="topbar-user">
          <span>
            {usuario?.nombre} <em>({rolLabels[usuario?.rol ?? ""]})</em>
          </span>
          <button className="btn btn-secondary" onClick={() => { logout(); navigate("/login"); }}>
            Salir
          </button>
        </div>
      </header>

      <main className="content">
        <h2>Bienvenido</h2>
        <p>Los módulos del sistema se habilitarán a medida que se completen las fases de desarrollo.</p>
        <div className="modulos-grid">
          {modulos.map((m, i) => (
            <div key={m} className={`modulo-card ${i > 0 ? "disabled" : ""}`}>
              <span className="modulo-ico">{i === 0 ? "✓" : "🔒"}</span>
              <span>{m}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
