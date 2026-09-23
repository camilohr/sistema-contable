import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthContext";
import { EmpresaProvider, useEmpresa } from "./EmpresaContext";
import type { Usuario } from "./AuthContext";

const { apiMock } = vi.hoisted(() => {
  const apiMock = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { apiMock };
});

vi.mock("../api/client", () => ({ api: apiMock }));

function Probe() {
  const { rol, puedeEditar, esAdmin } = useEmpresa();
  return (
    <div>
      <span data-testid="rol">{rol ?? "ninguno"}</span>
      <span data-testid="edita">{String(puedeEditar)}</span>
      <span data-testid="admin">{String(esAdmin)}</span>
    </div>
  );
}

const adminGlobal: Usuario = { id: "u1", nombre: "Ana", email: "a@b.co", rol: "ADMIN" };

function renderCon(usuario: Usuario, empresas: { id: string; nombre: string; nit: string; rol: string }[]) {
  localStorage.setItem("token", "tok");
  apiMock.get.mockImplementation((url: string) => {
    if (url === "/auth/me") return Promise.resolve({ data: usuario });
    if (url === "/empresas") return Promise.resolve({ data: empresas });
    return Promise.reject(new Error(`sin mock para ${url}`));
  });
  return render(
    <AuthProvider>
      <EmpresaProvider>
        <Probe />
      </EmpresaProvider>
    </AuthProvider>
  );
}

describe("EmpresaContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("el rol de la empresa activa gana sobre el rol global", async () => {
    renderCon(adminGlobal, [
      { id: "e1", nombre: "Emp 1", nit: "900", rol: "CONTADOR" },
      { id: "e2", nombre: "Emp 2", nit: "901", rol: "ADMIN" },
    ]);
    await waitFor(() => expect(screen.getByTestId("rol")).toHaveTextContent("CONTADOR"));
    expect(screen.getByTestId("edita")).toHaveTextContent("true");
    expect(screen.getByTestId("admin")).toHaveTextContent("false");
  });

  it("empresa ADMIN: esAdmin=true y puedeEditar=true", async () => {
    renderCon(adminGlobal, [{ id: "e1", nombre: "Emp 1", nit: "900", rol: "ADMIN" }]);
    await waitFor(() => expect(screen.getByTestId("admin")).toHaveTextContent("true"));
    expect(screen.getByTestId("rol")).toHaveTextContent("ADMIN");
    expect(screen.getByTestId("edita")).toHaveTextContent("true");
  });

  it("empresa AUXILIAR: no puede editar", async () => {
    renderCon(adminGlobal, [{ id: "e1", nombre: "Emp 1", nit: "900", rol: "AUXILIAR" }]);
    await waitFor(() => {
      expect(screen.getByTestId("edita")).toHaveTextContent("false");
      expect(screen.getByTestId("admin")).toHaveTextContent("false");
    });
  });

  it("sin empresas usa el rol global con una sola fuente", async () => {
    renderCon(adminGlobal, []);
    await waitFor(() => expect(screen.getByTestId("rol")).toHaveTextContent("ADMIN"));
    expect(screen.getByTestId("edita")).toHaveTextContent("true");
  });
});