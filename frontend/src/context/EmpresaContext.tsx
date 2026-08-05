import { createContext, useContext, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";
import type { Rol } from "./AuthContext";

export interface Empresa {
  id: string;
  nombre: string;
  nit: string;
  rol: Rol;
}

interface EmpresaContextType {
  empresas: Empresa[];
  empresaActiva: Empresa | null;
  cargando: boolean;
  seleccionarEmpresa: (id: string) => void;
}

const EmpresaContext = createContext<EmpresaContextType | undefined>(undefined);

const KEY = "empresaId";

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaActiva, setEmpresaActiva] = useState<Empresa | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!usuario) {
      setEmpresas([]);
      setEmpresaActiva(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    api
      .get<Empresa[]>("/empresas")
      .then((res) => {
        const lista = res.data;
        setEmpresas(lista);
        const guardada = lista.find((e) => e.id === localStorage.getItem(KEY));
        const activa = guardada ?? lista[0] ?? null;
        if (activa) localStorage.setItem(KEY, activa.id);
        setEmpresaActiva(activa);
      })
      .catch(() => {
        setEmpresas([]);
        setEmpresaActiva(null);
      })
      .finally(() => setCargando(false));
  }, [usuario]);

  const seleccionarEmpresa = useCallback(
    (id: string) => {
      localStorage.setItem(KEY, id);
      const e = empresas.find((x) => x.id === id);
      if (e) setEmpresaActiva(e);
    },
    [empresas]
  );

  return (
    <EmpresaContext.Provider value={{ empresas, empresaActiva, cargando, seleccionarEmpresa }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresa(): EmpresaContextType {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error("useEmpresa debe usarse dentro de EmpresaProvider");
  return ctx;
}
