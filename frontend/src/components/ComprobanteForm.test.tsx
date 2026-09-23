import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ComprobanteForm from "./ComprobanteForm";

const { apiMock } = vi.hoisted(() => {
  const apiMock = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { apiMock };
});

vi.mock("../api/client", () => ({ api: apiMock }));

const cuentas = [
  { id: 1, codigo: "1105", nombre: "Caja", requiereTercero: false },
  { id: 2, codigo: "1305", nombre: "Clientes", requiereTercero: true },
];
const terceros = [{ id: "t1", nombreRazonSocial: "Juan Perez", documento: "123" }];
const periodos = [{ id: 1, nombre: "2026-01", estado: "ABIERTO" }];

function cargarBase() {
  apiMock.get.mockImplementation((url: string) => {
    if (url === "/cuentas?soloMovimiento=true") return Promise.resolve({ data: cuentas });
    if (url === "/terceros?soloActivos=true") return Promise.resolve({ data: terceros });
    if (url === "/periodos") return Promise.resolve({ data: periodos });
    return Promise.reject(new Error(`sin mock para ${url}`));
  });
}

function renderForm() {
  render(<ComprobanteForm titulo="Nuevo comprobante" onClose={() => {}} onGuardado={() => {}} />);
}

function combos() {
  return screen.getAllByRole("combobox");
}

function montos() {
  return screen.getAllByPlaceholderText("0.00");
}

async function guardar() {
  fireEvent.click(await screen.findByRole("button", { name: /guardar/i }));
}

async function esperarFormulario() {
  await screen.findByRole("button", { name: /guardar/i });
}

describe("ComprobanteForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cargarBase();
  });

  it("exige un débito o un crédito por línea", async () => {
    renderForm();
    await esperarFormulario();
    fireEvent.change(combos()[1], { target: { value: "1" } }); // periodo
    fireEvent.change(screen.getByLabelText(/concepto/i), { target: { value: "Venta" } });
    fireEvent.change(combos()[2], { target: { value: "1" } }); // cuenta Caja
    await guardar();
    expect(await screen.findByText(/debe tener un débito o un crédito/)).toBeInTheDocument();
  });

  it("no permite débito y crédito a la vez en la misma línea", async () => {
    renderForm();
    await esperarFormulario();
    fireEvent.change(combos()[1], { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/concepto/i), { target: { value: "Venta" } });
    fireEvent.change(combos()[2], { target: { value: "1" } }); // Caja
    fireEvent.change(montos()[0], { target: { value: "50" } }); // débito
    fireEvent.change(montos()[1], { target: { value: "50" } }); // crédito
    await guardar();
    expect(await screen.findByText(/no puede tener débito y crédito a la vez/)).toBeInTheDocument();
  });

  it("exige tercero cuando la cuenta lo requiere", async () => {
    renderForm();
    await esperarFormulario();
    fireEvent.change(combos()[1], { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/concepto/i), { target: { value: "Venta" } });
    fireEvent.change(combos()[2], { target: { value: "2" } }); // Clientes (requiere tercero)
    fireEvent.change(montos()[0], { target: { value: "100" } }); // débito
    fireEvent.click(screen.getByText(/\+ Agregar asiento/));
    fireEvent.change(combos()[4], { target: { value: "1" } }); // cuenta línea 2: Caja
    fireEvent.change(montos()[3], { target: { value: "100" } }); // crédito línea 2
    await guardar();
    expect(await screen.findByText(/La línea 1 requiere un tercero/)).toBeInTheDocument();
  });

  it("envía la línea completa con tercero requerido (la partida cuadra)", async () => {
    renderForm();
    await esperarFormulario();
    fireEvent.change(combos()[1], { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/concepto/i), { target: { value: "Venta" } });
    fireEvent.change(combos()[2], { target: { value: "2" } }); // Clientes
    fireEvent.change(combos()[3], { target: { value: "t1" } }); // tercero
    fireEvent.change(montos()[0], { target: { value: "100" } }); // débito
    fireEvent.click(screen.getByText(/\+ Agregar asiento/));
    fireEvent.change(combos()[4], { target: { value: "1" } }); // Caja
    fireEvent.change(montos()[3], { target: { value: "100" } }); // crédito línea 2
    apiMock.post.mockResolvedValue({ data: {} });
    await guardar();
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    const payload = apiMock.post.mock.calls[0][1] as { asientos: { cuentaId: number; terceroId: string | null; debito?: number }[] };
    expect(payload.asientos[0].terceroId).toBe("t1");
    expect(payload.asientos[0].debito).toBe(100);
  });
});