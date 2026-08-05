import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api/client";

interface ProcesoCartera {
  id: string;
  anio: number;
  estado: string;
  avance: { total: number; completadas: number; porcentaje: number };
  notas: number;
}

interface FilaCartera {
  empresa: { id: string; nombre: string; nit: string };
  rol: string;
  proceso: ProcesoCartera | null;
}

function semaforo(porcentaje: number, estado: string) {
  if (estado === "CERRADO" || porcentaje === 100) return { clase: "semaforo-verde", etiqueta: "Al día" };
  if (porcentaje >= 50) return { clase: "semaforo-ambar", etiqueta: "En proceso" };
  return { clase: "semaforo-rojo", etiqueta: "Pendiente" };
}

export default function CarteraProcesos() {
  const navigate = useNavigate();
  const [cartera, setCartera] = useState<FilaCartera[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<FilaCartera[]>("/procesos/cartera")
      .then((res) => setCartera(res.data))
      .catch(() => setError("No se pudo cargar la cartera de clientes."));
  }, []);

  if (error) return <p className="error-msg">{error}</p>;
  if (cartera.length === 0) return null;

  return (
    <div className="section-card">
      <h3 className="section-title">Mis clientes · semáforo de procesos</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Rol</th>
              <th>Proceso</th>
              <th>Semáforo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cartera.map((f) => {
              const t = semaforo(f.proceso?.avance.porcentaje ?? 0, f.proceso?.estado ?? "PENDIENTE");
              return (
                <tr key={f.empresa.id}>
                  <td>{f.empresa.nombre}</td>
                  <td>{f.rol}</td>
                  <td>{f.proceso ? `${f.proceso.anio} · ${f.proceso.avance.completadas}/${f.proceso.avance.total}` : "Sin proceso"}</td>
                  <td>
                    <span className={t.clase}>
                      <span className="semaforo-dot" /> {t.etiqueta}
                    </span>
                  </td>
                  <td className="acciones">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/empresa/${f.empresa.id}/procesos`)}>
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
