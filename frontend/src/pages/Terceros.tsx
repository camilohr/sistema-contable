import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";
import { docLabel } from "../lib/documentos";

interface Tercero {
  id: string;
  tipo: "CLIENTE" | "PROVEEDOR" | "AMBOS";
  tipoDocumento: "CC" | "NIT" | "CE" | "PASAPORTE";
  documento: string;
  nombreRazonSocial: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  activo: boolean;
}

const tipoLabel: Record<string, string> = { CLIENTE: "Cliente", PROVEEDOR: "Proveedor", AMBOS: "Cliente/Proveedor" };

export default function Terceros() {
  const { puedeEditar } = useEmpresa();

  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Tercero | null>(null);
  const [desactivando, setDesactivando] = useState<Tercero | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.set("busqueda", busqueda.trim());
      if (tipo) params.set("tipo", tipo);
      if (soloActivos) params.set("soloActivos", "true");
      const res = await api.get<Tercero[]>(`/terceros${params.toString() ? `?${params}` : ""}`);
      setTerceros(res.data);
    } catch {
      setError("No se pudieron cargar los terceros.");
    } finally {
      setCargando(false);
    }
  }, [busqueda, tipo, soloActivos]);

  useEffect(() => {
    const t = setTimeout(() => cargar(), busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  const total = useMemo(() => terceros.length, [terceros]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Terceros</h2>
          <p className="count-hint">Catálogo de proveedores, clientes y otros terceros.</p>
        </div>
        {puedeEditar && (
          <button className="btn btn-primary" onClick={() => setCreando(true)}>
            Nuevo tercero
          </button>
        )}
      </div>

      <div className="filters">
        <input
          className="filter-input"
          type="search"
          placeholder="Buscar nombre, documento o correo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="filter-input">
          <option value="">Todos los tipos</option>
          <option value="CLIENTE">Clientes</option>
          <option value="PROVEEDOR">Proveedores</option>
          <option value="AMBOS">Cliente/Proveedor</option>
        </select>
        <label className="filter-check">
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>
      </div>

      {total > 0 && (
        <p className="count-hint">
          {total} tercero{total === 1 ? "" : "s"}
        </p>
      )}
      {error && <p className="error-msg">{error}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && terceros.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && terceros.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nombre / Razón social</th>
                <th>Tipo</th>
                <th>Ciudad</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {terceros.map((t) => (
                <tr key={t.id} className={!t.activo ? "inactiva" : ""}>
                  <td className="codigo-cell">
                    {docLabel[t.tipoDocumento]} {t.documento}
                  </td>
                  <td>{t.nombreRazonSocial}</td>
                  <td>{tipoLabel[t.tipo]}</td>
                  <td>{t.ciudad ?? "—"}</td>
                  <td>
                    {t.telefono ?? ""}
                    {t.email ? ` · ${t.email}` : ""}
                  </td>
                  <td>
                    {t.activo ? (
                      <span className="badge badge-mov">Activo</span>
                    ) : (
                      <span className="badge badge-err">Inactivo</span>
                    )}
                  </td>
                  <td className="acciones">
                    {puedeEditar && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditando(t)}>
                          Editar
                        </button>
                        {t.activo && (
                          <button className="btn btn-secondary btn-sm btn-danger" onClick={() => setDesactivando(t)}>
                            Desactivar
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

      {creando && <FormaNuevoTercero onClose={() => setCreando(false)} onCreado={() => { setCreando(false); cargar(); }} />}
      {editando && <FormaEditarTercero tercero={editando} onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar(); }} />}
      {desactivando && (
        <ConfirmarDesactivar
          tercero={desactivando}
          onClose={() => setDesactivando(null)}
          onHecho={() => { setDesactivando(null); cargar(); }}
        />
      )}
    </div>
  );
}

function FormaNuevoTercero({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [form, setForm] = useState({
    tipo: "CLIENTE",
    tipoDocumento: "CC",
    documento: "",
    nombreRazonSocial: "",
    direccion: "",
    telefono: "",
    email: "",
    ciudad: "",
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const set = (campo: string, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.post("/terceros", {
        ...form,
        direccion: form.direccion || null,
        telefono: form.telefono || null,
        email: form.email || null,
        ciudad: form.ciudad || null,
      });
      onCreado();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al crear el tercero.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Nuevo tercero</h3>
        <form onSubmit={onSubmit} className="form-card">
          <div className="form-row">
            <label>
              Tipo de documento
              <select value={form.tipoDocumento} onChange={(e) => set("tipoDocumento", e.target.value)}>
                {Object.entries(docLabel).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Número
              <input value={form.documento} onChange={(e) => set("documento", e.target.value)} required />
            </label>
          </div>
          <label>
            Nombre / Razón social
            <input value={form.nombreRazonSocial} onChange={(e) => set("nombreRazonSocial", e.target.value)} required />
          </label>
          <label>
            Tipo de tercero
            <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
              <option value="CLIENTE">Cliente</option>
              <option value="PROVEEDOR">Proveedor</option>
              <option value="AMBOS">Cliente/Proveedor</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              Ciudad
              <input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
            </label>
            <label>
              Teléfono
              <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </label>
          </div>
          <label>
            Correo electrónico
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label>
            Dirección
            <input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
          </label>
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
      </div>
    </div>
  );
}

function FormaEditarTercero({ tercero, onClose, onGuardado }: { tercero: Tercero; onClose: () => void; onGuardado: () => void }) {
  const [form, setForm] = useState({
    tipo: tercero.tipo,
    tipoDocumento: tercero.tipoDocumento,
    documento: tercero.documento,
    nombreRazonSocial: tercero.nombreRazonSocial,
    direccion: tercero.direccion ?? "",
    telefono: tercero.telefono ?? "",
    email: tercero.email ?? "",
    ciudad: tercero.ciudad ?? "",
    activo: tercero.activo,
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const set = (campo: string, valor: string | boolean) => setForm((f) => ({ ...f, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.patch(`/terceros/${tercero.id}`, {
        ...form,
        direccion: form.direccion || null,
        telefono: form.telefono || null,
        email: form.email || null,
        ciudad: form.ciudad || null,
      });
      onGuardado();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al guardar el tercero.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>
          Editar tercero <span className="muted">{docLabel[tercero.tipoDocumento]} {tercero.documento}</span>
        </h3>
        <form onSubmit={onSubmit} className="form-card">
          <div className="form-row">
            <label>
              Tipo de documento
              <select value={form.tipoDocumento} onChange={(e) => set("tipoDocumento", e.target.value)}>
                {Object.entries(docLabel).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Número
              <input value={form.documento} onChange={(e) => set("documento", e.target.value)} required />
            </label>
          </div>
          <label>
            Nombre / Razón social
            <input value={form.nombreRazonSocial} onChange={(e) => set("nombreRazonSocial", e.target.value)} required />
          </label>
          <label>
            Tipo de tercero
            <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
              <option value="CLIENTE">Cliente</option>
              <option value="PROVEEDOR">Proveedor</option>
              <option value="AMBOS">Cliente/Proveedor</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              Ciudad
              <input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
            </label>
            <label>
              Teléfono
              <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </label>
          </div>
          <label>
            Correo electrónico
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label>
            Dirección
            <input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={form.activo} onChange={(e) => set("activo", e.target.checked)} />
            Activo
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

function ConfirmarDesactivar({ tercero, onClose, onHecho }: { tercero: Tercero; onClose: () => void; onHecho: () => void }) {
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const desactivar = async () => {
    setError("");
    setEnviando(true);
    try {
      await api.delete(`/terceros/${tercero.id}`);
      onHecho();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Error al desactivar el tercero.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Desactivar tercero</h3>
        <p>
          ¿Desactivar a <strong>{tercero.nombreRazonSocial}</strong>? No podrá usarse en nuevos documentos, pero se conserva su historial.
        </p>
        {error && <p className="error-msg">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-danger" onClick={desactivar} disabled={enviando}>
            {enviando ? "Desactivando..." : "Desactivar"}
          </button>
        </div>
      </div>
    </div>
  );
}
