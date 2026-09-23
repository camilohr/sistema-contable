import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import { cop } from "../lib/formato";

interface Empleado {
  id: string;
  terceroId: string;
  documento: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  salarioBase: number;
  fechaIngreso: string;
  fechaRetiro: string | null;
  ibcAjuste: number;
  arlEmpleador: number;
  auxilioTransporteManual: boolean;
  activo: boolean;
  numLiquidaciones: number;
}

interface Tercero {
  id: string;
  tipoDocumento: "CC" | "NIT" | "CE" | "PASAPORTE";
  documento: string;
  nombreRazonSocial: string;
}

const estadoLabel = (e: Empleado) =>
  e.activo ? (
    <span className="badge badge-mov">Activo</span>
  ) : (
    <span className="badge badge-err">Retirado</span>
  );

export default function Empleados() {
  const { puedeEditar } = useEmpresa();

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [soloActivos, setSoloActivos] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Empleado | null>(null);
  const [retirando, setRetirando] = useState<Empleado | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await api.get<Empleado[]>(`/empleados?activo=${soloActivos}`);
      setEmpleados(res.data);
    } catch {
      setError("No se pudieron cargar los empleados.");
    } finally {
      setCargando(false);
    }
  }, [soloActivos]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Empleados</h2>
          <p className="count-hint">Personal con contrato vigente y sus liquidaciones.</p>
        </div>
        {puedeEditar && (
          <button className="btn btn-primary" onClick={() => setCreando(true)}>
            Nuevo empleado
          </button>
        )}
      </div>

      <div className="filters">
        <label className="filter-check">
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && empleados.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && empleados.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nombre</th>
                <th>Cargo</th>
                <th className="num-cell">Salario base</th>
                <th>Ingreso</th>
                <th className="num-cell">Retiro</th>
                <th className="num-cell">Liquidaciones</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((e) => (
                <tr key={e.id} className={!e.activo ? "inactiva" : ""}>
                  <td className="codigo-cell mono">{e.documento}</td>
                  <td>{e.nombre}</td>
                  <td>{e.cargo ?? "—"}</td>
                  <td className="num-cell">{cop(e.salarioBase)}</td>
                  <td>{e.fechaIngreso}</td>
                  <td className="num-cell">{e.fechaRetiro ?? "—"}</td>
                  <td className="num-cell">{e.numLiquidaciones}</td>
                  <td>{estadoLabel(e)}</td>
                  <td className="acciones">
                    {puedeEditar && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditando(e)}>
                          Editar
                        </button>
                        {e.activo && (
                          <button className="btn btn-secondary btn-sm btn-danger" onClick={() => setRetirando(e)}>
                            Retirar
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && (
        <FormaNuevoEmpleado
          onClose={() => setCreando(false)}
          onCreado={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}
      {editando && (
        <FormaEditarEmpleado
          empleado={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
      {retirando && (
        <FormaRetiro
          empleado={retirando}
          onClose={() => setRetirando(null)}
          onHecho={() => {
            setRetirando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function FormaNuevoEmpleado({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [yaRegistrados, setYaRegistrados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);

  const [form, setForm] = useState({
    terceroId: "",
    cargo: "",
    salarioBase: "1750905",
    fechaIngreso: "2026-01-01",
    ibcAjuste: "0",
    arlEmpleador: "0.522",
    auxilioTransporteManual: false,
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const set = (campo: string, valor: string | boolean) => setForm((f) => ({ ...f, [campo]: valor }));

  useEffect(() => {
    (async () => {
      try {
        const [t, e] = await Promise.all([api.get<Tercero[]>("/terceros"), api.get<Empleado[]>("/empleados")]);
        setTerceros(t.data.filter((x) => x.tipoDocumento === "CC"));
        setYaRegistrados(new Set(e.data.map((x) => x.terceroId)));
      } catch {
        setError("No se pudieron cargar los terceros.");
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const disponibles = terceros.filter((t) => !yaRegistrados.has(t.id));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.post("/empleados", {
        terceroId: form.terceroId,
        cargo: form.cargo || null,
        salarioBase: Number(form.salarioBase),
        fechaIngreso: form.fechaIngreso,
        ibcAjuste: Number(form.ibcAjuste),
        arlEmpleador: Number(form.arlEmpleador),
        auxilioTransporteManual: form.auxilioTransporteManual,
      });
      onCreado();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al crear el empleado.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Nuevo empleado</h3>
        {cargando ? (
          <p className="count-hint">Cargando terceros...</p>
        ) : (
          <form onSubmit={onSubmit} className="form-card">
            <label>
              Persona (tercero con documento CC)
              <select value={form.terceroId} onChange={(e) => set("terceroId", e.target.value)} required>
                <option value="">Seleccione...</option>
                {disponibles.map((t) => (
                  <option key={t.id} value={t.id}>
                    CC {t.documento} · {t.nombreRazonSocial}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                Cargo
                <input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
              </label>
              <label>
                Salario base (COP)
                <input type="number" min="0" step="0.01" value={form.salarioBase} onChange={(e) => set("salarioBase", e.target.value)} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Fecha de ingreso
                <input type="date" value={form.fechaIngreso} onChange={(e) => set("fechaIngreso", e.target.value)} required />
              </label>
              <label>
                Ajuste al IBC (COP)
                <input type="number" min="0" step="0.01" value={form.ibcAjuste} onChange={(e) => set("ibcAjuste", e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label>
                ARL (%) 
                <input type="number" min="0" max="10" step="0.001" value={form.arlEmpleador} onChange={(e) => set("arlEmpleador", e.target.value)} />
              </label>
              <label className="filter-check">
                <input type="checkbox" checked={form.auxilioTransporteManual} onChange={(e) => set("auxilioTransporteManual", e.target.checked)} />
                Auxilio de transporte manual (sin límite por salario)
              </label>
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={enviando}>
                {enviando ? "Creando..." : "Crear"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function FormaEditarEmpleado({ empleado, onClose, onGuardado }: { empleado: Empleado; onClose: () => void; onGuardado: () => void }) {
  const [form, setForm] = useState({
    cargo: empleado.cargo ?? "",
    salarioBase: String(empleado.salarioBase),
    ibcAjuste: String(empleado.ibcAjuste),
    arlEmpleador: String(empleado.arlEmpleador),
    auxilioTransporteManual: empleado.auxilioTransporteManual,
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const set = (campo: string, valor: string | boolean) => setForm((f) => ({ ...f, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.patch(`/empleados/${empleado.id}`, {
        cargo: form.cargo || null,
        salarioBase: Number(form.salarioBase),
        ibcAjuste: Number(form.ibcAjuste),
        arlEmpleador: Number(form.arlEmpleador),
        auxilioTransporteManual: form.auxilioTransporteManual,
      });
      onGuardado();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al guardar el empleado.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>
          Editar empleado <span className="muted">CC {empleado.documento} · {empleado.nombre}</span>
        </h3>
        <form onSubmit={onSubmit} className="form-card">
          <div className="form-row">
            <label>
              Cargo
              <input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </label>
            <label>
              Salario base (COP)
              <input type="number" min="0" step="0.01" value={form.salarioBase} onChange={(e) => set("salarioBase", e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            <label>
              Ajuste al IBC (COP)
              <input type="number" min="0" step="0.01" value={form.ibcAjuste} onChange={(e) => set("ibcAjuste", e.target.value)} />
            </label>
            <label>
              ARL (%)
              <input type="number" min="0" max="10" step="0.001" value={form.arlEmpleador} onChange={(e) => set("arlEmpleador", e.target.value)} />
            </label>
          </div>
          <label className="filter-check">
            <input type="checkbox" checked={form.auxilioTransporteManual} onChange={(e) => set("auxilioTransporteManual", e.target.checked)} />
            Auxilio de transporte manual (sin límite por salario)
          </label>
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
      </div>
    </div>
  );
}

function FormaRetiro({ empleado, onClose, onHecho }: { empleado: Empleado; onClose: () => void; onHecho: () => void }) {
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const retirar = async () => {
    setError("");
    setEnviando(true);
    try {
      await api.post(`/empleados/${empleado.id}/retiro`, { fechaRetiro: fecha });
      onHecho();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al retirar el empleado.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Retirar empleado</h3>
        <p>
          ¿Retirar a <strong>{empleado.nombre}</strong> (CC {empleado.documento})? Dejará de incluirse en las
          liquidaciones, pero se conserva su historial.
        </p>
        <label>
          Fecha de retiro
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        {error && <p className="error-msg">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-danger" onClick={retirar} disabled={enviando || !fecha}>
            {enviando ? "Retirando..." : "Retirar"}
          </button>
        </div>
      </div>
    </div>
  );
}
