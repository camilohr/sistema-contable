import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

interface Cliente {
  id: string;
  nombre: string;
  nit: string;
  direccion: string | null;
  telefono: string | null;
  moneda: string;
  anioFiscalInicio: number;
  mensajeRecibo: string | null;
  activa: boolean;
  createdAt: string;
  updatedAt: string;
  conteos: { usuarios: number; periodos: number; procesos: number; adjuntos: number };
}

interface FormaDatos {
  nombre: string;
  nit: string;
  direccion: string;
  telefono: string;
}

const vacio: FormaDatos = { nombre: "", nit: "", direccion: "", telefono: "" };

export default function Clientes() {
  const { usuario } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [baja, setBaja] = useState<Cliente | null>(null);
  const [descargando, setDescargando] = useState<string>("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await api.get<Cliente[]>("/empresas/administracion");
      setClientes(res.data);
    } catch {
      setError("No se pudieron cargar los clientes.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (usuario?.rol !== "ADMIN") {
    return (
      <div className="page">
        <h2>Clientes</h2>
        <p className="error-msg">Solo el administrador puede gestionar clientes.</p>
      </div>
    );
  }

  const descargarPaquete = async (cliente: Cliente, anio: number) => {
    setDescargando(cliente.id);
    setError("");
    try {
      const res = await api.post(`/empresas/${cliente.id}/informes/paquete-final`, { anio }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informes-${anio}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMensaje(`Paquete final de ${cliente.nombre} (${anio}) generado.`);
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo generar el paquete final.");
    } finally {
      setDescargando("");
    }
  };

  const confirmarBaja = async (cliente: Cliente) => {
    setError("");
    setMensaje("");
    try {
      await api.patch(`/empresas/${cliente.id}/estado`, { activa: false });
      setBaja(null);
      setMensaje(`El cliente "${cliente.nombre}" quedó dado de baja.`);
      await cargar();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo dar de baja al cliente.");
    }
  };

  const reactivar = async (cliente: Cliente) => {
    if (!window.confirm(`¿Reactivar al cliente "${cliente.nombre}"?`)) return;
    setError("");
    try {
      await api.patch(`/empresas/${cliente.id}/estado`, { activa: true });
      setMensaje(`El cliente "${cliente.nombre}" fue reactivado.`);
      await cargar();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo reactivar al cliente.");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Clientes</h2>
        <button className="btn btn-primary" onClick={() => setCreando(true)}>
          Nuevo cliente
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {mensaje && <p className="success-msg">{mensaje}</p>}
      {cargando && <p className="count-hint">Cargando...</p>}
      {!cargando && clientes.length === 0 && <p className="count-hint">Sin resultados.</p>}

      {!cargando && clientes.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>NIT</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th>Usuarios</th>
                <th>Periodos</th>
                <th>Procesos</th>
                <th>Adjuntos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className={!c.activa ? "inactiva" : ""}>
                  <td>{c.nombre}</td>
                  <td className="codigo-cell">{c.nit}</td>
                  <td>{c.direccion ?? "-"}</td>
                  <td>
                    {c.activa ? <span className="badge badge-mov">Activa</span> : <span className="badge badge-err">Dada de baja</span>}
                  </td>
                  <td className="num-cell">{c.conteos.usuarios}</td>
                  <td className="num-cell">{c.conteos.periodos}</td>
                  <td className="num-cell">{c.conteos.procesos}</td>
                  <td className="num-cell">{c.conteos.adjuntos}</td>
                  <td className="acciones">
                    {c.activa ? (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditando(c)}>
                          Editar
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setBaja(c)}>
                          Dar de baja
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => reactivar(c)}>
                        Reactivar
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => descargarPaquete(c, new Date().getFullYear())}
                      disabled={descargando === c.id}
                      title="Descargar paquete final de informes del año actual"
                    >
                      {descargando === c.id ? "Generando..." : "Paquete final"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <FormaCliente onClose={() => setCreando(false)} onGuardado={() => { setCreando(false); cargar(); }} />}
      {editando && <FormaCliente cliente={editando} onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar(); }} />}
      {baja && (
        <ModalBaja
          cliente={baja}
          descargando={descargando === baja.id}
          onDescargar={(anio) => descargarPaquete(baja, anio)}
          onConfirmar={() => confirmarBaja(baja)}
          onClose={() => setBaja(null)}
        />
      )}
    </div>
  );
}

function FormaCliente({
  cliente,
  onClose,
  onGuardado,
}: {
  cliente?: Cliente;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState<FormaDatos>(
    cliente
      ? { nombre: cliente.nombre, nit: cliente.nit, direccion: cliente.direccion ?? "", telefono: cliente.telefono ?? "" }
      : vacio
  );
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const set = (campo: keyof FormaDatos, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      if (cliente) {
        await api.patch(`/empresas/${cliente.id}`, form);
      } else {
        await api.post("/empresas", form);
      }
      onGuardado();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "Error al guardar el cliente.");
      setEnviando(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{cliente ? "Editar cliente" : "Nuevo cliente"}</h3>
        <form onSubmit={onSubmit} className="form-card">
          <label>
            Razón social
            <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
          </label>
          <label>
            NIT
            <input value={form.nit} onChange={(e) => set("nit", e.target.value)} required />
          </label>
          <label>
            Dirección
            <input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
          </label>
          <label>
            Teléfono
            <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
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

function ModalBaja({
  cliente,
  descargando,
  onDescargar,
  onConfirmar,
  onClose,
}: {
  cliente: Cliente;
  descargando: boolean;
  onDescargar: (anio: number) => void;
  onConfirmar: () => void;
  onClose: () => void;
}) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [error, setError] = useState("");

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Dar de baja al cliente</h3>
        <p>
          Antes de dar de baja a <strong>{cliente.nombre}</strong>, genere el paquete final de informes para conservar la documentación del
          ejercicio.
        </p>
        <div className="form-card">
          <label>
            Año del paquete final
            <input type="number" value={anio} min={2000} max={2100} onChange={(e) => setAnio(Number(e.target.value))} />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setError("");
                try {
                  onDescargar(anio);
                } catch {
                  setError("No se pudo generar el paquete final.");
                }
              }}
              disabled={descargando}
            >
              {descargando ? "Generando..." : "Descargar paquete final"}
            </button>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-danger" onClick={onConfirmar}>
              Confirmar baja
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
