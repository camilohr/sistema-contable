import { useEffect, useState } from "react";
import { Calculator, GitCompare } from "lucide-react";
import { api } from "../api/client";
import { Button, Table } from "../components/ui";
import { cop } from "../lib/formato";

interface Periodo {
  id: number;
  nombre: string;
}

interface Datos {
  activoCorriente: number;
  activoNoCorriente: number;
  activoTotal: number;
  pasivoCorriente: number;
  pasivoNoCorriente: number;
  pasivoTotal: number;
  patrimonio: number;
  inventario: number;
  cartera: number;
  ingresos: number;
  ventas: number;
  costoVentas: number;
  gastos: number;
  utilidadNeta: number;
}

interface Razones {
  razonCorriente: number | null;
  pruebaAcida: number | null;
  endeudamiento: number | null;
  margenNeto: number | null;
  rotacionCartera: number | null;
  rotacionInventario: number | null;
}

interface Individual {
  periodo: Periodo;
  datos: Datos;
  razones: Razones;
}

interface VerticalFila {
  codigo: string;
  nombre: string;
  saldoDesde: number;
  pctDesde: number | null;
  saldoHasta: number;
  pctHasta: number | null;
}

interface SeccionVertical {
  seccion: string;
  totalDesde: number;
  totalHasta: number;
  filas: VerticalFila[];
}

interface HorizontalFila {
  seccion: string;
  nombre: string;
  desde: number;
  hasta: number;
  variacion: number;
  variacionPct: number | null;
}

interface Comparativo {
  periodos: { desde: Periodo; hasta: Periodo };
  datos: { desde: Datos; hasta: Datos };
  razones: { desde: Razones; hasta: Razones };
  vertical: SeccionVertical[];
  horizontal: HorizontalFila[];
}

type Tab = "individual" | "comparativo";

const tabs: { id: Tab; label: string }[] = [
  { id: "individual", label: "Indicadores del periodo" },
  { id: "comparativo", label: "Comparativo entre periodos" },
];

const razonesDef: { key: keyof Razones; label: string; formula: string }[] = [
  { key: "razonCorriente", label: "Razón corriente", formula: "Activo corriente / Pasivo corriente" },
  { key: "pruebaAcida", label: "Prueba ácida", formula: "(Activo corriente − Inventario) / Pasivo corriente" },
  { key: "endeudamiento", label: "Endeudamiento", formula: "Pasivo total / Activo total" },
  { key: "margenNeto", label: "Margen neto", formula: "Utilidad neta / Ingresos" },
  { key: "rotacionCartera", label: "Rotación de cartera", formula: "Ventas / Cartera" },
  { key: "rotacionInventario", label: "Rotación de inventario", formula: "Costo de ventas / Inventario" },
];

const fmtRazon = (v: number | null): string => (v === null ? "—" : v.toFixed(2));
const fmtPct = (v: number | null): string => (v === null ? "—" : `${v.toFixed(2)}%`);
const fmtSaldo = (v: number): string => (v === 0 ? "-" : cop(v));

function RazonesGrid({ razones }: { razones: Razones }) {
  return (
    <div className="modulos-grid">
      {razonesDef.map((r) => (
        <div key={r.key} className="modulo-card">
          <span className="modulo-ico">◈</span>
          <span>
            <strong>{razones[r.key] === null ? "—" : fmtRazon(razones[r.key])}</strong> · {r.label}
          </span>
          <small className="muted">{r.formula}</small>
        </div>
      ))}
    </div>
  );
}

function DatosResumen({ datos }: { datos: Datos }) {
  const filas: { label: string; valor: string }[] = [
    { label: "Activo corriente", valor: cop(datos.activoCorriente) },
    { label: "Activo no corriente", valor: cop(datos.activoNoCorriente) },
    { label: "Activo total", valor: cop(datos.activoTotal) },
    { label: "Pasivo corriente", valor: cop(datos.pasivoCorriente) },
    { label: "Pasivo no corriente", valor: cop(datos.pasivoNoCorriente) },
    { label: "Patrimonio", valor: cop(datos.patrimonio) },
    { label: "Inventario", valor: cop(datos.inventario) },
    { label: "Cartera (deudores)", valor: cop(datos.cartera) },
    { label: "Ingresos", valor: cop(datos.ingresos) },
    { label: "Ventas", valor: cop(datos.ventas) },
    { label: "Costo de ventas", valor: cop(datos.costoVentas) },
    { label: "Gastos", valor: cop(datos.gastos) },
    { label: "Utilidad neta", valor: cop(datos.utilidadNeta) },
  ];
  return (
    <div className="detail-grid">
      {filas.map((f) => (
        <div key={f.label}>
          <span>{f.label}</span>
          <em className="mono">{f.valor}</em>
        </div>
      ))}
    </div>
  );
}

export default function Indicadores() {
  const [tab, setTab] = useState<Tab>("individual");
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoId, setPeriodoId] = useState("");
  const [desdeId, setDesdeId] = useState("");
  const [hastaId, setHastaId] = useState("");

  const [individual, setIndividual] = useState<Individual | null>(null);
  const [comparativo, setComparativo] = useState<Comparativo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Periodo[]>("/periodos").then((r) => setPeriodos(r.data)).catch(() => {});
  }, []);

  const cargarIndividual = async () => {
    if (!periodoId) {
      setError("Selecciona un periodo.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const res = await api.get<Individual>(`/reportes/indicadores/${periodoId}`);
      setIndividual(res.data);
    } catch {
      setError("No se pudieron calcular los indicadores.");
    } finally {
      setCargando(false);
    }
  };

  const cargarComparativo = async () => {
    if (!desdeId || !hastaId) {
      setError("Selecciona los dos periodos a comparar.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const res = await api.get<Comparativo>(`/reportes/indicadores/comparativo?desde=${desdeId}&hasta=${hastaId}`);
      setComparativo(res.data);
    } catch {
      setError("No se pudo generar el comparativo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Indicadores financieros</h2>
          <p className="count-hint">Ratios de rentabilidad, liquidez y endeudamiento.</p>
        </div>
      </div>

      <div className="tabs-reportes">
        {tabs.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "primary" : "secondary"} size="sm" onClick={() => setTab(t.id)}>
            {t.id === "individual" ? <Calculator size={14} /> : <GitCompare size={14} />}
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "individual" && (
        <>
          <div className="filters">
            <select className="filter-input" value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
              <option value="">Selecciona un periodo</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <Button onClick={cargarIndividual} disabled={cargando}>
              <Calculator size={15} />
              Calcular
            </Button>
          </div>

          {error && <p className="error-msg">{error}</p>}
          {cargando && <p className="count-hint">Cargando...</p>}

          {individual && (
            <>
              <p className="count-hint">Indicadores calculados sobre los saldos del periodo: {individual.periodo.nombre}.</p>
              <RazonesGrid razones={individual.razones} />
              <div className="section-card">
                <h3>Datos base</h3>
                <DatosResumen datos={individual.datos} />
              </div>
            </>
          )}
        </>
      )}

      {tab === "comparativo" && (
        <>
          <div className="filters">
            <select className="filter-input" value={desdeId} onChange={(e) => setDesdeId(e.target.value)}>
              <option value="">Periodo inicial</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select className="filter-input" value={hastaId} onChange={(e) => setHastaId(e.target.value)}>
              <option value="">Periodo final</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <Button onClick={cargarComparativo} disabled={cargando}>
              <GitCompare size={15} />
              Comparar
            </Button>
          </div>

          {error && <p className="error-msg">{error}</p>}
          {cargando && <p className="count-hint">Cargando...</p>}

          {comparativo && (
            <>
              <p className="count-hint">
                Comparación de {comparativo.periodos.desde.nombre} contra {comparativo.periodos.hasta.nombre}. Las rotaciones del periodo final usan el saldo promedio de ambos periodos.
              </p>

              <div className="section-card">
                <h3>Razones por periodo</h3>
                <Table
                  columns={[
                    { key: "label", header: "Indicador", render: (r) => r.label },
                    { key: "desde", header: comparativo.periodos.desde.nombre, align: "right", mono: true, render: (r) => fmtRazon(comparativo.razones.desde[r.key]) },
                    { key: "hasta", header: comparativo.periodos.hasta.nombre, align: "right", mono: true, render: (r) => fmtRazon(comparativo.razones.hasta[r.key]) },
                    {
                      key: "variacion",
                      header: "Variación",
                      align: "right",
                      mono: true,
                      render: (r) => {
                        const desde = comparativo.razones.desde[r.key];
                        const hasta = comparativo.razones.hasta[r.key];
                        const varPct = desde !== null && hasta !== null ? ((hasta - desde) / Math.abs(desde)) * 100 : null;
                        return varPct === null ? "—" : `${varPct > 0 ? "+" : ""}${varPct.toFixed(1)}%`;
                      },
                    },
                  ]}
                  rows={razonesDef}
                  keyOf={(r) => r.key}
                  empty="Sin datos."
                />
              </div>

              {comparativo.vertical.map((s) => (
                <div key={s.seccion} className="section-card">
                  <h3>Análisis vertical — {s.seccion}</h3>
                  <p className="count-hint">
                    Participación de cada cuenta sobre el total de la sección. Totales: {cop(s.totalDesde)} → {cop(s.totalHasta)}.
                  </p>
                  <div className="table-wrap">
                    <Table
                      columns={[
                        { key: "codigo", header: "Cuenta", mono: true, render: (f) => f.codigo },
                        { key: "nombre", header: "Nombre", render: (f) => f.nombre },
                        { key: "desde", header: comparativo.periodos.desde.nombre, align: "right", mono: true, render: (f) => fmtSaldo(f.saldoDesde) },
                        { key: "pctDesde", header: "% desde", align: "right", mono: true, render: (f) => fmtPct(f.pctDesde) },
                        { key: "hasta", header: comparativo.periodos.hasta.nombre, align: "right", mono: true, render: (f) => fmtSaldo(f.saldoHasta) },
                        { key: "pctHasta", header: "% hasta", align: "right", mono: true, render: (f) => fmtPct(f.pctHasta) },
                      ]}
                      rows={s.filas}
                      keyOf={(f) => f.codigo}
                      empty="Sin movimientos."
                    />
                  </div>
                </div>
              ))}

              {comparativo.horizontal.length > 0 && (
                <div className="section-card">
                  <h3>Análisis horizontal</h3>
                  <p className="count-hint">Variación absoluta y porcentual entre periodos.</p>
                  <div className="table-wrap">
                    <Table
                      columns={[
                        { key: "seccion", header: "Sección", render: (f) => f.seccion },
                        { key: "nombre", header: "Concepto", render: (f) => f.nombre },
                        { key: "desde", header: "Desde", align: "right", mono: true, render: (f) => fmtSaldo(f.desde) },
                        { key: "hasta", header: "Hasta", align: "right", mono: true, render: (f) => fmtSaldo(f.hasta) },
                        { key: "variacion", header: "Variación", align: "right", mono: true, render: (f) => fmtSaldo(f.variacion) },
                        {
                          key: "pct",
                          header: "%",
                          align: "right",
                          mono: true,
                          render: (f) => (f.variacionPct === null ? "—" : `${f.variacionPct > 0 ? "+" : ""}${f.variacionPct.toFixed(1)}%`),
                        },
                      ]}
                      rows={comparativo.horizontal}
                      keyOf={(_, i) => String(i)}
                      empty="Sin datos."
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
