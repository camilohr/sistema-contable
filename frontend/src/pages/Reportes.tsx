import { Fragment, useCallback, useEffect, useState } from "react";
import { FileArchive, FileSpreadsheet, FileText } from "lucide-react";
import { api } from "../api/client";
import { useEmpresa } from "../context/EmpresaContext";
import { Button, Table } from "../components/ui";
import type { Column } from "../components/ui";
import { cop } from "../lib/formato";
import styles from "./Reportes.module.css";

type Tab = "diario" | "mayor" | "balance" | "balance-general" | "resultados";

interface Linea {
  comprobanteId: number;
  ref: string;
  fecha: string;
  concepto: string;
  codigoCuenta: string;
  nombreCuenta: string;
  tercero: string | null;
  debito: number;
  credito: number;
}

interface CuentaMayor {
  codigo: string;
  nombre: string;
  naturaleza: string;
  debitos: number;
  creditos: number;
  saldo: number;
}

interface CuentaBalance {
  codigo: string;
  nombre: string;
  clase: number;
  naturaleza: string;
  debitos: number;
  creditos: number;
  saldoDeudor: number;
  saldoAcreedor: number;
}

interface SeccionCuentas {
  grupo: string;
  nombre: string;
  cuentas: { codigo: string; nombre: string; saldo: number }[];
  total: number;
}

interface BalanceGeneral {
  activo: SeccionCuentas[];
  pasivo: SeccionCuentas[];
  patrimonio: SeccionCuentas[];
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
  resultado: number;
  ecuacionOK: boolean;
}

interface EstadoResultados {
  ingresos: SeccionCuentas[];
  costos: SeccionCuentas[];
  costosProduccion: SeccionCuentas[];
  gastos: SeccionCuentas[];
  totalIngresos: number;
  totalCostos: number;
  totalCostosProduccion: number;
  totalGastos: number;
  resultado: number;
}

interface Periodo {
  id: number;
  nombre: string;
}

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
}

const tabs: { id: Tab; label: string }[] = [
  { id: "diario", label: "Libro diario" },
  { id: "mayor", label: "Libro mayor" },
  { id: "balance", label: "Balance de comprobación" },
  { id: "balance-general", label: "Balance general" },
  { id: "resultados", label: "Estado de resultados" },
];

const naturaLabel: Record<string, string> = { DEUDORA: "Deudora", ACREEDORA: "Acreedora" };

const columnasDiario: Column<Linea>[] = [
  { key: "fecha", header: "Fecha", mono: true, render: (l) => l.fecha },
  { key: "ref", header: "No", mono: true, render: (l) => l.ref },
  { key: "concepto", header: "Concepto", render: (l) => l.concepto },
  { key: "cuenta", header: "Cuenta", mono: true, render: (l) => l.codigoCuenta },
  { key: "nombre", header: "Nombre de la cuenta", render: (l) => l.nombreCuenta },
  { key: "tercero", header: "Tercero", render: (l) => l.tercero ?? "-" },
  { key: "debito", header: "Débito", align: "right", mono: true, render: (l) => (l.debito ? cop(l.debito) : "") },
  { key: "credito", header: "Crédito", align: "right", mono: true, render: (l) => (l.credito ? cop(l.credito) : "") },
];

const columnasMayor: Column<CuentaMayor>[] = [
  { key: "codigo", header: "Cuenta", mono: true, render: (c) => c.codigo },
  { key: "nombre", header: "Nombre", render: (c) => c.nombre },
  { key: "naturaleza", header: "Naturaleza", render: (c) => naturaLabel[c.naturaleza] ?? c.naturaleza },
  { key: "debitos", header: "Débitos", align: "right", mono: true, render: (c) => cop(c.debitos) },
  { key: "creditos", header: "Créditos", align: "right", mono: true, render: (c) => cop(c.creditos) },
  { key: "saldo", header: "Saldo", align: "right", mono: true, render: (c) => cop(c.saldo) },
];

const columnasBalance: Column<CuentaBalance>[] = [
  { key: "codigo", header: "Cuenta", mono: true, render: (c) => c.codigo },
  { key: "nombre", header: "Nombre", render: (c) => c.nombre },
  { key: "clase", header: "Clase", render: (c) => c.clase },
  { key: "debitos", header: "Débitos", align: "right", mono: true, render: (c) => cop(c.debitos) },
  { key: "creditos", header: "Créditos", align: "right", mono: true, render: (c) => cop(c.creditos) },
  { key: "saldoDeudor", header: "Saldo deudor", align: "right", mono: true, render: (c) => (c.saldoDeudor ? cop(c.saldoDeudor) : "") },
  { key: "saldoAcreedor", header: "Saldo acreedor", align: "right", mono: true, render: (c) => (c.saldoAcreedor ? cop(c.saldoAcreedor) : "") },
];

export default function Reportes() {
  const { empresaActiva } = useEmpresa();
  const [tab, setTab] = useState<Tab>("diario");
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);

  const [periodoId, setPeriodoId] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [cuentaId, setCuentaId] = useState("");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [diario, setDiario] = useState<{ lineas: Linea[]; totalDebitos: number; totalCreditos: number } | null>(null);
  const [mayor, setMayor] = useState<{ cuentas: CuentaMayor[]; totalDebitos: number; totalCreditos: number } | null>(null);
  const [balance, setBalance] = useState<{ cuentas: CuentaBalance[]; totalDebitos: number; totalCreditos: number; saldosDeudores: number; saldosAcreedores: number } | null>(null);
  const [balanceGeneral, setBalanceGeneral] = useState<BalanceGeneral | null>(null);
  const [resultados, setResultados] = useState<EstadoResultados | null>(null);

  useEffect(() => {
    api.get<Periodo[]>("/periodos").then((r) => setPeriodos(r.data)).catch(() => {});
    api.get<Cuenta[]>("/cuentas?soloMovimiento=true").then((r) => setCuentas(r.data)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const params = new URLSearchParams();
    if (periodoId) params.set("periodoId", periodoId);
    if (fechaDesde) params.set("fechaDesde", fechaDesde);
    if (fechaHasta) params.set("fechaHasta", fechaHasta);
    if (tab === "mayor" && cuentaId) params.set("cuentaId", cuentaId);
    const q = params.toString() ? `?${params}` : "";
    try {
      if (tab === "diario") {
        const res = await api.get(`/reportes/libro-diario${q}`);
        setDiario(res.data);
      } else if (tab === "mayor") {
        const res = await api.get(`/reportes/libro-mayor${q}`);
        setMayor(res.data);
      } else if (tab === "balance") {
        const res = await api.get(`/reportes/balance-comprobacion${q}`);
        setBalance(res.data);
      } else if (tab === "balance-general") {
        const res = await api.get(`/reportes/balance-general${q}`);
        setBalanceGeneral(res.data);
      } else {
        const res = await api.get(`/reportes/estado-resultados${q}`);
        setResultados(res.data);
      }
    } catch {
      setError("No se pudo cargar el reporte.");
    } finally {
      setCargando(false);
    }
  }, [tab, periodoId, fechaDesde, fechaHasta, cuentaId]);

  const descargar = useCallback(async (ruta: string, nombre: string) => {
    setError("");
    try {
      const res = await api.get(ruta, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el archivo.");
    }
  }, []);

  const paramsActuales = useCallback(() => {
    const params = new URLSearchParams();
    if (periodoId) params.set("periodoId", periodoId);
    if (fechaDesde) params.set("fechaDesde", fechaDesde);
    if (fechaHasta) params.set("fechaHasta", fechaHasta);
    if (tab === "mayor" && cuentaId) params.set("cuentaId", cuentaId);
    const q = params.toString() ? `?${params}` : "";
    return q;
  }, [periodoId, fechaDesde, fechaHasta, tab, cuentaId]);

  const descargarPdf = useCallback(
    async (archivo: "libro-diario.pdf" | "libro-mayor.pdf" | "libro-inventarios.pdf") => {
      const q = paramsActuales();
      await descargar(`/reportes/${archivo}${q}`, archivo);
    },
    [paramsActuales, descargar]
  );

  const exportar = useCallback(
    async (formato: "csv" | "xlsx") => {
      const ruta: Record<Tab, string> = {
        diario: "libro-diario",
        mayor: "libro-mayor",
        balance: "balance-comprobacion",
        "balance-general": "balance-general",
        resultados: "estado-resultados",
      };
      const q = paramsActuales();
      await descargar(`/reportes/${ruta[tab]}.${formato}${q}`, `${ruta[tab]}.${formato}`);
    },
    [tab, paramsActuales, descargar]
  );

  const descargarPaquete = async () => {
    if (!empresaActiva) return;
    setError("");
    try {
      const res = await api.post(
        `/empresas/${empresaActiva.id}/informes/paquete`,
        periodoId ? { periodoId: Number(periodoId) } : { anio: new Date().getFullYear() },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informes-${periodoId ? periodos.find((p) => p.id === Number(periodoId))?.nombre ?? "periodo" : new Date().getFullYear()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el paquete de informes.");
    }
  };

  useEffect(() => {
    const t = setTimeout(() => cargar(), 250);
    return () => clearTimeout(t);
  }, [cargar]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Libros y reportes</h2>
          <p className="count-hint">Libros oficiales, balance general y estado de resultados.</p>
        </div>
      </div>

      <div className="tabs-reportes">
        {tabs.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "primary" : "secondary"} size="sm" onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>

      <div className="filters">
        <select className="filter-input" value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
          <option value="">Todos los periodos</option>
          {periodos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <input type="date" className="filter-input" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} title="Desde" />
        <input type="date" className="filter-input" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} title="Hasta" />
        {tab === "mayor" && (
          <select className="filter-input" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} - {c.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}

      <div className={`filters ${styles.pdfActions}`}>
        {tab === "diario" && (
          <Button variant="secondary" onClick={() => descargarPdf("libro-diario.pdf")}>
            <FileText size={15} />
            Libro diario (PDF)
          </Button>
        )}
        {tab === "mayor" && (
          <Button variant="secondary" onClick={() => descargarPdf("libro-mayor.pdf")}>
            <FileText size={15} />
            Libro mayor (PDF)
          </Button>
        )}
        {tab === "balance-general" && (
          <>
            <Button variant="secondary" onClick={() => descargarPdf("libro-inventarios.pdf")}>
              <FileText size={15} />
              Libro de inventarios (PDF)
            </Button>
            <Button variant="secondary" onClick={() => descargar("/reportes/balance-general.pdf" + paramsActuales(), "balance-general.pdf")}>
              <FileText size={15} />
              Balance general (PDF)
            </Button>
          </>
        )}
        {tab === "resultados" && (
          <Button variant="secondary" onClick={() => descargar("/reportes/estado-resultados.pdf" + paramsActuales(), "estado-resultados.pdf")}>
            <FileText size={15} />
            Estado de resultados (PDF)
          </Button>
        )}
        <span className={`count-hint ${styles.exportHint}`}>Exportar como tabla:</span>
        <Button variant="secondary" onClick={() => exportar("csv")}>
          <FileSpreadsheet size={15} />
          CSV
        </Button>
        <Button variant="secondary" onClick={() => exportar("xlsx")}>
          <FileSpreadsheet size={15} />
          XLSX
        </Button>
        <Button variant="secondary" onClick={descargarPaquete}>
          <FileArchive size={15} />
          Paquete de informes (ZIP)
        </Button>
      </div>

      {tab === "diario" && diario && (
        <>
          <p className="count-hint">
            {diario.lineas.length === 0
              ? "Sin movimientos para los filtros seleccionados."
              : `${diario.lineas.length} movimientos. Total débitos ${cop(diario.totalDebitos)} · total créditos ${cop(diario.totalCreditos)}.`}
          </p>
          {diario.lineas.length > 0 && (
            <Table
              columns={columnasDiario}
              rows={diario.lineas}
              keyOf={(_, i) => String(i)}
              empty="Sin movimientos."
              footer={
                <tr>
                  <td colSpan={6}>Totales</td>
                  <td className="num-cell">{cop(diario.totalDebitos)}</td>
                  <td className="num-cell">{cop(diario.totalCreditos)}</td>
                </tr>
              }
            />
          )}
        </>
      )}

      {tab === "mayor" && mayor && (
        <>
          <p className="count-hint">
            {mayor.cuentas.length === 0
              ? "Sin movimientos para los filtros seleccionados."
              : `${mayor.cuentas.length} cuentas. Total débitos ${cop(mayor.totalDebitos)} · total créditos ${cop(mayor.totalCreditos)}.`}
          </p>
          {mayor.cuentas.length > 0 && (
            <Table
              columns={columnasMayor}
              rows={mayor.cuentas}
              keyOf={(c) => c.codigo}
              empty="Sin movimientos."
              footer={
                <tr>
                  <td colSpan={3}>Totales</td>
                  <td className="num-cell">{cop(mayor.totalDebitos)}</td>
                  <td className="num-cell">{cop(mayor.totalCreditos)}</td>
                  <td></td>
                </tr>
              }
            />
          )}
        </>
      )}

      {tab === "balance" && balance && (
        <>
          <p className="count-hint">
            {balance.cuentas.length === 0
              ? "Sin movimientos para los filtros seleccionados."
              : `Sumas cuadran: débitos ${cop(balance.totalDebitos)} = créditos ${cop(balance.totalCreditos)}. Saldos deudores ${cop(balance.saldosDeudores)} = acreedores ${cop(balance.saldosAcreedores)}.`}
          </p>
          {balance.cuentas.length > 0 && (
            <Table
              columns={columnasBalance}
              rows={balance.cuentas}
              keyOf={(c) => c.codigo}
              empty="Sin movimientos."
              footer={
                <tr>
                  <td colSpan={3}>Totales</td>
                  <td className="num-cell">{cop(balance.totalDebitos)}</td>
                  <td className="num-cell">{cop(balance.totalCreditos)}</td>
                  <td className="num-cell">{cop(balance.saldosDeudores)}</td>
                  <td className="num-cell">{cop(balance.saldosAcreedores)}</td>
                </tr>
              }
            />
          )}
        </>
      )}

      {tab === "balance-general" && balanceGeneral && (
        <>
          <p className="count-hint">
            {balanceGeneral.ecuacionOK
              ? `Ecuación contable correcta: Activo ${cop(balanceGeneral.totalActivo)} = Pasivo ${cop(balanceGeneral.totalPasivo)} + Patrimonio ${cop(balanceGeneral.totalPatrimonio)}.`
              : "La ecuación contable no cuadra: revise los asientos."}
          </p>
          <div className={styles.estadoSeccion}>
            <h3 className={styles.estadoTitulo}>Activo</h3>
            <SeccionTable seccion={balanceGeneral.activo} />
            <p className={styles.estadoTotal}>Total activo: {cop(balanceGeneral.totalActivo)}</p>
          </div>
          <div className={styles.estadoSeccion}>
            <h3 className={styles.estadoTitulo}>Pasivo</h3>
            <SeccionTable seccion={balanceGeneral.pasivo} />
            <p className={styles.estadoTotal}>Total pasivo: {cop(balanceGeneral.totalPasivo)}</p>
          </div>
          <div className={styles.estadoSeccion}>
            <h3 className={styles.estadoTitulo}>Patrimonio</h3>
            <SeccionTable seccion={balanceGeneral.patrimonio} />
            <p className={styles.estadoTotal}>Total patrimonio: {cop(balanceGeneral.totalPatrimonio)}</p>
          </div>
        </>
      )}

      {tab === "resultados" && resultados && (
        <>
          <p className="count-hint">
            {resultados.resultado >= 0
              ? `Utilidad del ejercicio: ${cop(resultados.resultado)}.`
              : `Pérdida del ejercicio: ${cop(-resultados.resultado)}.`}
          </p>
          <div className={styles.estadoSeccion}>
            <h3 className={styles.estadoTitulo}>Ingresos</h3>
            <SeccionTable seccion={resultados.ingresos} />
            <p className={styles.estadoTotal}>Total ingresos: {cop(resultados.totalIngresos)}</p>
          </div>
          <div className={styles.estadoSeccion}>
            <h3 className={styles.estadoTitulo}>Costos de ventas</h3>
            <SeccionTable seccion={resultados.costos} />
            <p className={styles.estadoTotal}>Total costos de ventas: {cop(resultados.totalCostos)}</p>
          </div>
          <div className={styles.estadoSeccion}>
            <h3 className={styles.estadoTitulo}>Costos de producción</h3>
            <SeccionTable seccion={resultados.costosProduccion} />
            <p className={styles.estadoTotal}>Total costos de producción: {cop(resultados.totalCostosProduccion)}</p>
          </div>
          <div className={styles.estadoSeccion}>
            <h3 className={styles.estadoTitulo}>Gastos</h3>
            <SeccionTable seccion={resultados.gastos} />
            <p className={styles.estadoTotal}>Total gastos: {cop(resultados.totalGastos)}</p>
          </div>
          <p className={`${styles.estadoTotal} ${styles.resultadoLine}`}>
            Resultado del ejercicio: {resultados.resultado >= 0 ? cop(resultados.resultado) : `(${cop(-resultados.resultado)})`}
          </p>
        </>
      )}
    </div>
  );
}

function SeccionTable({ seccion }: { seccion: SeccionCuentas[] }) {
  if (seccion.length === 0) return <p className="count-hint">Sin movimientos.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Cuenta</th>
            <th>Nombre</th>
            <th className="num-cell">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {seccion.map((g) => (
            <Fragment key={g.grupo}>
              <tr className={styles.grupoRow}>
                <td className="codigo-cell">{g.grupo}</td>
                <td>{g.nombre}</td>
                <td className="num-cell">{cop(g.total)}</td>
              </tr>
              {g.cuentas.map((c) => (
                <tr key={c.codigo}>
                  <td className="codigo-cell">{c.codigo}</td>
                  <td>{c.nombre}</td>
                  <td className="num-cell">{cop(c.saldo)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
