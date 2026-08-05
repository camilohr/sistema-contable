import { useCallback, useEffect, useRef, useState } from "react";
import { useEmpresa } from "../context/EmpresaContext";
import { api } from "../api/client";

interface Adjunto {
  id: number;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: number;
  createdAt: string;
  usuario: string;
}

interface Props {
  entidad: "COMPROBANTE" | "EMPRESA";
  entidadId: string;
}

const tamaño = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function AdjuntosLista({ entidad, entidadId }: Props) {
  const { empresaActiva } = useEmpresa();
  const rol = empresaActiva?.rol;
  const puedeEditar = rol === "ADMIN" || rol === "CONTADOR";

  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setError("");
    try {
      const res = await api.get<Adjunto[]>("/adjuntos", { params: { entidad, entidadId } });
      setAdjuntos(res.data);
    } catch {
      setError("No se pudieron cargar los documentos.");
    }
  }, [entidad, entidadId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    setError("");
    const fd = new FormData();
    fd.append("entidad", entidad);
    fd.append("entidadId", entidadId);
    fd.append("archivo", archivo);
    try {
      await api.post("/adjuntos", fd);
      if (inputRef.current) inputRef.current.value = "";
      cargar();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo subir el documento.");
    } finally {
      setSubiendo(false);
    }
  };

  const descargar = async (a: Adjunto) => {
    setError("");
    try {
      const res = await api.get(`/adjuntos/${a.id}/descargar`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.nombreOriginal;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo descargar el documento.");
    }
  };

  const eliminar = async (a: Adjunto) => {
    if (!window.confirm(`¿Eliminar el documento "${a.nombreOriginal}"?`)) return;
    setError("");
    try {
      await api.delete(`/adjuntos/${a.id}`);
      cargar();
    } catch (err) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? "No se pudo eliminar el documento.");
    }
  };

  return (
    <div className="adjuntos">
      <div className="adjuntos-head">
        <span className="section-title">Documentos adjuntos ({adjuntos.length})</span>
        {puedeEditar && (
          <label className="btn btn-secondary btn-sm adjuntos-subir">
            {subiendo ? "Subiendo..." : "Adjuntar archivo"}
            <input ref={inputRef} type="file" disabled={subiendo} onChange={subir} />
          </label>
        )}
      </div>
      {error && <p className="error-msg">{error}</p>}
      {adjuntos.length === 0 && !error && <p className="count-hint">Sin documentos adjuntos.</p>}
      {adjuntos.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Tamaño</th>
                <th>Subido por</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adjuntos.map((a) => (
                <tr key={a.id}>
                  <td className="codigo-cell">{a.nombreOriginal}</td>
                  <td className="mono">{tamaño(a.tamanoBytes)}</td>
                  <td>{a.usuario}</td>
                  <td className="mono">{a.createdAt.slice(0, 10)}</td>
                  <td className="acciones">
                    <button className="btn btn-secondary btn-sm" onClick={() => descargar(a)}>
                      Descargar
                    </button>
                    {puedeEditar && (
                      <button className="btn btn-secondary btn-sm btn-danger" onClick={() => eliminar(a)}>
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
