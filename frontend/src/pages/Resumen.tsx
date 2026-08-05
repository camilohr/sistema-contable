import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import AlertasPanel from "../components/AlertasPanel";
import CarteraProcesos from "../components/CarteraProcesos";
import AdjuntosLista from "../components/AdjuntosLista";

interface ProcesoResumen {
  id: string;
  anio: number;
  estado: string;
  avance: { total: number; completadas: number; porcentaje: number };
}

interface ResumenData {
  empresa: { id: string; nombre: string; nit: string };
  periodoObjetivo: { id: number; nombre: string; anio: number } | null;
  proceso: ProcesoResumen | null;
  periodos: { abiertos: number; vencidos: number };
  comprobantes: { borradores: number; contabilizados: number };
  nomina: { contabilizada: boolean; periodoId: number } | null;
  provision: { calculada: boolean; periodoId: number } | null;
  presupuesto: { cargado: boolean; periodoId: number; partidas: number } | null;
  cierreAnio: { anio: number; cerrado: boolean } | null;
  alertas: { total: number; altas: number; medias: number; bajas: number };
}

const ETIQUETAS_ESTADO: Record<string, string> = {
  SIN_INICIAR: "Sin iniciar",
  EN_PROCESO: "En proceso",
  PENDIENTE: "Pendiente",
  AL_DIA: "Al día",
  CERRADO: "Cerrado",
};

function semaforo(porcentaje: number, estado: string) {
  if (estado === "CERRADO" || porcentaje === 100) return { clase: "semaforo-verde", etiqueta: "Al día" };
  if (porcentaje >= 50) return { clase: "semaforo-ambar", etiqueta: "En proceso" };
  return { clase: "semaforo-rojo", etiqueta: "Pendiente" };
}

export default function Resumen() {
  const { empresaActiva } = useEmpresa();
  const navigate = useNavigate();
  const base = `/empresa/${empresaActiva?.id ?? ""}`;

  const [resumen, setResumen] = useState<ResumenData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setCargando(true);
    setError("");
    api
      .get<ResumenData>("/resumen")
      .then((res) => setResumen(res.data))
      .catch(() => setError("No se pudo cargar el resumen de la empresa."))
      .finally(() => setCargando(false));
  }, [empresaActiva?.id]);

  if (cargando) return <p className="count-hint">Cargando resumen...</p>;
  if (error) return <p className="error-msg">{error}</p>;
  if (!resumen) return <p className="error-msg">Sin datos de la empresa.</p>;

  const { proceso, periodoObjetivo } = resumen;
  const sinPeriodos = !periodoObjetivo;
  const s = proceso ? semaforo(proceso.avance.porcentaje, proceso.estado) : null;

  const ir = (ruta: string) => navigate(`${base}/${ruta}`);

  const tarjetas: { titulo: string; valor: string; sub: string; valorClase?: string; ruta: string }[] = [
    {
      titulo: "Proceso contable",
      valor: proceso ? ETIQUETAS_ESTADO[proceso.estado] ?? proceso.estado : "Sin proceso",
      sub: proceso ? `${proceso.avance.completadas}/${proceso.avance.total} actividades (${proceso.avance.porcentaje}%)` : `No hay proceso del ${periodoObjetivo?.anio ?? "año"}. Créelo en Seguimiento.`,
      valorClase: s?.clase,
      ruta: "procesos",
    },
    {
      titulo: "Comprobantes",
      valor: String(resumen.comprobantes.contabilizados),
      sub: `${resumen.comprobantes.borradores} en borrador por contabilizar`,
      valorClase: resumen.comprobantes.borradores > 0 ? "estado-pend" : "estado-ok",
      ruta: "comprobantes",
    },
    {
      titulo: "Periodos",
      valor: String(resumen.periodos.abiertos),
      sub: resumen.periodos.vencidos > 0 ? `${resumen.periodos.vencidos} vencidos por cerrar` : "todos al día",
      valorClase: resumen.periodos.vencidos > 0 ? "estado-err" : "estado-ok",
      ruta: "periodos",
    },
    {
      titulo: "Nómina",
      valor: sinPeriodos ? "—" : resumen.nomina?.contabilizada ? "Contabilizada" : "Sin contabilizar",
      sub: sinPeriodos ? "sin periodos" : `periodo ${periodoObjetivo?.nombre ?? ""}`,
      valorClase: sinPeriodos || resumen.nomina?.contabilizada ? "estado-ok" : "estado-pend",
      ruta: "nomina",
    },
    {
      titulo: "Provisión de cartera",
      valor: sinPeriodos ? "—" : resumen.provision?.calculada ? "Calculada" : "Pendiente",
      sub: sinPeriodos ? "sin periodos" : "deterioro de la cartera",
      valorClase: sinPeriodos || resumen.provision?.calculada ? "estado-ok" : "estado-pend",
      ruta: "provision-cartera",
    },
    {
      titulo: "Presupuesto",
      valor: sinPeriodos ? "—" : resumen.presupuesto?.cargado ? `Cargado (${resumen.presupuesto.partidas} partidas)` : "Sin cargar",
      sub: sinPeriodos ? "sin periodos" : "control presupuestal",
      valorClase: sinPeriodos || resumen.presupuesto?.cargado ? "estado-ok" : "estado-pend",
      ruta: "presupuesto",
    },
    {
      titulo: "Cierre anual",
      valor: sinPeriodos ? "—" : resumen.cierreAnio?.cerrado ? "Cerrado" : "Abierto",
      sub: sinPeriodos ? "sin periodos" : `año ${periodoObjetivo?.anio ?? ""}`,
      valorClase: sinPeriodos || resumen.cierreAnio?.cerrado ? "estado-ok" : "estado-pend",
      ruta: "cierre-anual",
    },
    {
      titulo: "Alertas",
      valor: String(resumen.alertas.total),
      sub: `${resumen.alertas.altas} altas · ${resumen.alertas.medias} medias · ${resumen.alertas.bajas} bajas`,
      valorClase: resumen.alertas.altas > 0 ? "estado-err" : "estado-ok",
      ruta: "",
    },
  ];

  return (
    <div className="page">
      <div className="resumen-head">
        <div>
          <h2>Proceso de {resumen.empresa.nombre}</h2>
          <p className="count-hint">
            NIT {resumen.empresa.nit}
            {periodoObjetivo && <> · periodo objetivo: {periodoObjetivo.nombre}</>}
          </p>
        </div>
        {s && (
          <span className={`${s.clase} badge`}>
            <span className="semaforo-dot" /> {s.etiqueta}
          </span>
        )}
      </div>

      <div className="estado-grid">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="estado-card clickable" onClick={() => ir(t.ruta)}>
            <span className="estado-titulo">{t.titulo}</span>
            <span className={`estado-valor ${t.valorClase ?? ""}`}>{t.valor}</span>
            <span className="estado-sub">{t.sub}</span>
            {t.ruta && <span className="estado-ir">Ir a {t.titulo.toLowerCase()} →</span>}
          </div>
        ))}
      </div>

      {proceso && (
        <div className="section-card">
          <h3 className="section-title">Actividades del proceso {proceso.anio}</h3>
          <div className="proceso-barra">
            <span className="count-hint">
              {proceso.avance.completadas}/{proceso.avance.total} ({proceso.avance.porcentaje}%)
            </span>
            <div className="proceso-bar">
              <div className="proceso-bar-fill" style={{ width: `${proceso.avance.porcentaje}%` }} />
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => ir("procesos")}>
            Abrir seguimiento
          </button>
        </div>
      )}

      <AlertasPanel />
      <CarteraProcesos />

      {empresaActiva && (
        <div className="section-card">
          <AdjuntosLista entidad="EMPRESA" entidadId={empresaActiva.id} />
        </div>
      )}
    </div>
  );
}
