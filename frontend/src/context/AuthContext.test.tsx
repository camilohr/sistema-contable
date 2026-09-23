import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import type { Usuario } from "./AuthContext";

const { apiMock } = vi.hoisted(() => {
  const apiMock = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { apiMock };
});

vi.mock("../api/client", () => ({ api: apiMock }));

function Probe() {
  const { usuario, cargando, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="estado">{cargando ? "cargando" : usuario ? usuario.nombre : "sin-sesion"}</span>
      <button onClick={() => login("correo@x.com", "clave123")}>ingresar</button>
      <button onClick={() => logout()}>salir</button>
    </div>
  );
}

const usuario: Usuario = { id: "u1", nombre: "Ana", email: "a@b.co", rol: "ADMIN" };

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("sin token no consulta /auth/me", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(await screen.findByText("sin-sesion")).toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("restaura la sesión con un token vigente", async () => {
    localStorage.setItem("token", "tok");
    apiMock.get.mockResolvedValue({ data: usuario });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith("/auth/me");
  });

  it("login guarda el token y expone al usuario", async () => {
    apiMock.post.mockResolvedValue({ data: { token: "tok", usuario } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    fireEvent.click(screen.getByText("ingresar"));
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe("tok");
  });

  it("logout limpia token y empresaId", async () => {
    apiMock.post.mockResolvedValue({ data: { token: "tok", usuario } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    fireEvent.click(screen.getByText("ingresar"));
    await screen.findByText("Ana");
    localStorage.setItem("empresaId", "e1");
    fireEvent.click(screen.getByText("salir"));
    expect(screen.getByText("sin-sesion")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("empresaId")).toBeNull();
  });
});