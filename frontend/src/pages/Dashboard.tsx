import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import AlertasPanel from "../components/AlertasPanel";

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

export default function Dashboard() {
  const { empresaActiva } = useEmpresa();
  const navigate = useNavigate();
  const esAdmin = empresaActiva?.rol === "ADMIN";
  const base = `/empresa/${empresaActiva?.id ?? ""}`;

  const [cartera, setCartera] = useState<FilaCartera[]>([]);

  useEffect(() => {
    api
      .get<FilaCartera[]>("/procesos/cartera")
      .then((res) => setCartera(res.data))
      .catch(() => setCartera([]));
  }, []);

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
    <div>
      <h2>Bienvenido, {empresaActiva?.nombre ?? "al sistema"}</h2>
      <p className="count-hint">
        Empresa activa: {empresaActiva?.nombre} · Rol: {empresaActiva?.rol}
      </p>
      <div className="modulos-grid">
        {modulos.map((m) => (
          <div key={m.nombre} className="modulo-card clickable" onClick={() => navigate(m.ruta)}>
            <span className="modulo-ico">✓</span>
            <span>{m.nombre}</span>
          </div>
        ))}
      </div>
      {cartera.length > 0 && (
        <div className="section-card">
          <h3 className="section-title">Cartera de clientes · semáforo de procesos</h3>
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
      )}
      <AlertasPanel />
    </div>
  );
}
