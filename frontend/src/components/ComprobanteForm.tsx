import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import styles from "./ComprobanteForm.module.css";

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
  requiereTercero: boolean;
}

interface Tercero {
  id: string;
  nombreRazonSocial: string;
  documento: string;
}

export interface AsientoLinea {
  cuentaId: number | "";
  terceroId: string;
  debito: string;
  credito: string;
  detalle: string;
}

interface Periodo {
  id: number;
  nombre: string;
  estado: "ABIERTO" | "CERRADO";
}

export interface ComprobanteFormData {
  id?: number;
  tipo: "DIARIO" | "INGRESO" | "EGRESO";
  fecha: string;
  periodoId: number | "";
  concepto: string;
  estado: "BORRADOR" | "CONTABILIZADO";
  asientos: AsientoLinea[];
}

interface Props {
  inicial?: ComprobanteFormData;
  titulo: string;
  onClose: () => void;
  onGuardado: () => void;
}

const tipoOptions = [
  { value: "DIARIO", label: "Diario" },
  { value: "INGRESO", label: "Ingreso" },
  { value: "EGRESO", label: "Egreso" },
];

const hoy = new Date().toISOString().slice(0, 10);

export default function ComprobanteForm({ inicial, titulo, onClose, onGuardado }: Props) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState<ComprobanteFormData>(
    inicial ?? {
      tipo: "DIARIO",
      fecha: hoy,
      periodoId: "",
      concepto: "",
      estado: "BORRADOR",
      asientos: [{ cuentaId: "", terceroId: "", debito: "", credito: "", detalle: "" }],
    }
  );
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Cuenta[]>("/cuentas?soloMovimiento=true"),
      api.get<Tercero[]>("/terceros?soloActivos=true"),
      api.get<Periodo[]>("/periodos"),
    ])
      .then(([c, t, p]) => {
        setCuentas(c.data);
        setTerceros(t.data);
        setPeriodos(p.data.filter((x) => x.estado === "ABIERTO"));
      })
      .catch(() => setError("No se pudieron cargar los datos del formulario."))
      .finally(() => setCargando(false));
  }, []);

  const set = (campo: keyof ComprobanteFormData, valor: unknown) => setForm((f) => ({ ...f, [campo]: valor }));

  const setAsiento = (i: number, campo: keyof AsientoLinea, valor: string) =>
    setForm((f) => ({
      ...f,
      asientos: f.asientos.map((a, idx) => (idx === i ? { ...a, [campo]: valor } : a)),
    }));

  const agregarAsiento = () =>
    setForm((f) => ({ ...f, asientos: [...f.asientos, { cuentaId: "", terceroId: "", debito: "", credito: "", detalle: "" }] }));

  const quitarAsiento = (i: number) =>
    setForm((f) => ({
      ...f,
      asientos: f.asientos.length > 2 ? f.asientos.filter((_, idx) => idx !== i) : f.asientos,
    }));

  const totales = useMemo(() => {
    let debito = 0;
    let credito = 0;
    for (const a of form.asientos) {
      debito += parseFloat(a.debito) || 0;
      credito += parseFloat(a.credito) || 0;
    }
    return { debito, credito, cuadra: Math.abs(debito - credito) < 0.01 };
  }, [form.asientos]);

  const cuentaPorId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.periodoId) return setError("Seleccione el periodo.");
    if (!totales.cuadra) return setError("La partida doble no cuadra: revise los débitos y créditos.");
    if (form.asientos.some((a) => !a.cuentaId)) return setError("Todos los asientos deben tener una cuenta.");

    const asientos = form.asientos.map((a) => ({
      cuentaId: a.cuentaId,
      terceroId: a.terceroId || null,
      debito: parseFloat(a.debito) || undefined,
      credito: parseFloat(a.credito) || undefined,
      detalle: a.detalle || null,
    }));

    setEnviando(true);
    try {
      const payload = {
        tipo: form.tipo,
        fecha: form.fecha,
        periodoId: form.periodoId,
        concepto: form.concepto,
        asientos,
        ...(inicial ? {} : { estado: form.estado }),
      };
      if (inicial) {
        await api.patch(`/comprobantes/${inicial.id}`, payload);
      } else {
        await api.post("/comprobantes", payload);
      }
      onGuardado();
    } catch (err) {
      const ex = err as { response?: { data?: { error?: string } } };
      setError(ex.response?.data?.error ?? "Error al guardar el comprobante.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h3>{titulo}</h3>
        {cargando ? (
          <p className="count-hint">Cargando...</p>
        ) : (
          <form onSubmit={onSubmit} className="form-card">
            <div className="form-row">
              <label>
                Tipo
                <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                  {tipoOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Fecha<span className="req">*</span>
                <input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} required />
              </label>
              <label>
                Periodo<span className="req">*</span>
                <select value={form.periodoId} onChange={(e) => set("periodoId", Number(e.target.value))} required>
                  <option value="">Seleccione...</option>
                  {periodos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              {!inicial && (
                <label>
                  Estado
                  <select value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                    <option value="BORRADOR">Borrador</option>
                    <option value="CONTABILIZADO">Contabilizado</option>
                  </select>
                </label>
              )}
            </div>
            <label>
              Concepto<span className="req">*</span>
              <input value={form.concepto} onChange={(e) => set("concepto", e.target.value)} required placeholder="Ej: Venta de contado" />
            </label>

            <div className={styles.asientosHead}>
              <span className={styles.colCuenta}>Cuenta<span className="req">*</span></span>
              <span className={styles.colTercero}>Tercero</span>
              <span className={styles.colDebito}>Débito</span>
              <span className={styles.colCredito}>Crédito</span>
              <span className={styles.colDetalle}>Detalle</span>
              <span className={styles.colQuitar}></span>
            </div>
            {form.asientos.map((a, i) => {
              const cuenta = a.cuentaId ? cuentaPorId.get(a.cuentaId) : undefined;
              return (
                <div className={styles.asientosFila} key={i}>
                  <select
                    className={styles.colCuenta}
                    value={a.cuentaId}
                    onChange={(e) => setAsiento(i, "cuentaId", e.target.value)}
                    required
                  >
                    <option value="">—</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} {c.nombre}
                      </option>
                    ))}
                  </select>
                  <select className={styles.colTercero} value={a.terceroId} onChange={(e) => setAsiento(i, "terceroId", e.target.value)}>
                    <option value="">—</option>
                    {terceros.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombreRazonSocial}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.colDebito}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={a.debito}
                    onChange={(e) => setAsiento(i, "debito", e.target.value)}
                  />
                  <input
                    className={styles.colCredito}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={a.credito}
                    onChange={(e) => setAsiento(i, "credito", e.target.value)}
                  />
                  <input
                    className={styles.colDetalle}
                    value={a.detalle}
                    onChange={(e) => setAsiento(i, "detalle", e.target.value)}
                    placeholder="Detalle"
                  />
                  <button type="button" className={`btn btn-secondary btn-sm ${styles.colQuitar}`} onClick={() => quitarAsiento(i)}>
                    ✕
                  </button>
                  {cuenta?.requiereTercero && !a.terceroId && (
                    <span className={styles.requiereTercero}>requiere tercero</span>
                  )}
                </div>
              );
            })}
            <div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={agregarAsiento}>
                + Agregar asiento
              </button>
            </div>

            <div className={styles.totales}>
              <span>Débitos: <strong>{totales.debito.toFixed(2)}</strong></span>
              <span>Créditos: <strong>{totales.credito.toFixed(2)}</strong></span>
              <span className={totales.cuadra ? "success-msg" : "error-msg"}>
                {totales.cuadra ? "Cuadra ✓" : "No cuadra"}
              </span>
            </div>

            {error && <p className="error-msg">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={enviando}>
                {enviando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
