import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { DocumentoPdf, Columna, Fila, DatosEmpresa, formatearMoneda, formatearFecha } from "../lib/pdf.js";
import { datosBalanceGeneral, datosLibroDiario, datosLibroMayor, datosEstadoResultados, whereFiltros } from "./reportes.controller.js";
import { obtenerDatosIndicadores } from "./indicadores.controller.js";

async function obtenerEmpresa(empresaId: string): Promise<DatosEmpresa> {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  return e
    ? { nombreEmpresa: e.nombre, nit: e.nit, direccion: e.direccion ?? undefined, telefono: e.telefono ?? undefined }
    : { nombreEmpresa: "Empresa", nit: "000000000" };
}

export async function textoPeriodo(req: Request): Promise<string> {
  const periodoId = req.query.periodoId ? Number(req.query.periodoId) : undefined;
  if (periodoId) {
    const p = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId: req.empresaId } });
    if (p) return `Periodo: ${p.nombre}`;
  }
  const desde = req.query.fechaDesde ? String(req.query.fechaDesde) : undefined;
  const hasta = req.query.fechaHasta ? String(req.query.fechaHasta) : undefined;
  const partes = [desde ? `Del ${desde}` : "", hasta ? `al ${hasta}` : ""].filter(Boolean);
  return partes.join(" ");
}

function responderPdf(res: Response, buffer: Buffer, nombreArchivo: string): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${nombreArchivo}"`);
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
}

export async function generarPdfLibroDiario(empresa: DatosEmpresa, req: Request): Promise<Buffer> {
  const [datos, periodo] = await Promise.all([datosLibroDiario(whereFiltros(req)), textoPeriodo(req)]);

  const columnas: Columna[] = [
    { campo: "ref", titulo: "REF", ancho: 1.2, alinear: "centro" },
    { campo: "fecha", titulo: "FECHA", ancho: 1.2, alinear: "centro", formato: (v) => formatearFecha(String(v ?? "")) },
    { campo: "concepto", titulo: "CONCEPTO", ancho: 2.6 },
    { campo: "codigo", titulo: "CTA", ancho: 1.1, alinear: "centro" },
    { campo: "nombreCuenta", titulo: "NOMBRE DE LA CUENTA", ancho: 2.6 },
    { campo: "tercero", titulo: "TERCERO", ancho: 2 },
    { campo: "debito", titulo: "DÉBITO", ancho: 1.5, alinear: "derecha", formato: (v) => formatearMoneda(Number(v ?? 0)) },
    { campo: "credito", titulo: "CRÉDITO", ancho: 1.5, alinear: "derecha", formato: (v) => formatearMoneda(Number(v ?? 0)) },
  ];

  const filas: Fila[] = datos.lineas.map((l) => ({
    ref: l.ref,
    fecha: l.fecha.toISOString().slice(0, 10),
    concepto: l.concepto,
    codigo: l.codigoCuenta,
    nombreCuenta: l.nombreCuenta,
    tercero: l.tercero ?? "",
    debito: l.debito,
    credito: l.credito,
  }));

  const pdf = new DocumentoPdf({ empresa, titulo: "LIBRO DIARIO", subtitulo: periodo });
  pdf.tabla(columnas, filas);
  pdf.filaTotal(columnas, { concepto: "TOTALES", debito: datos.totalDebitos, credito: datos.totalCreditos });
  return pdf.fin();
}

export async function libroDiarioPdf(req: Request, res: Response): Promise<void> {
  const empresa = await obtenerEmpresa(req.empresaId!);
  responderPdf(res, await generarPdfLibroDiario(empresa, req), "libro-diario.pdf");
}

export async function generarPdfLibroMayor(empresa: DatosEmpresa, req: Request): Promise<Buffer> {
  const cuentaId = req.query.cuentaId ? Number(req.query.cuentaId) : undefined;
  const [datos, periodo] = await Promise.all([datosLibroMayor(whereFiltros(req), cuentaId), textoPeriodo(req)]);

  const columnas: Columna[] = [
    { campo: "codigo", titulo: "CÓDIGO", ancho: 1.1, alinear: "centro" },
    { campo: "nombre", titulo: "CUENTA", ancho: 3.4 },
    { campo: "naturaleza", titulo: "NAT.", ancho: 1.1, alinear: "centro" },
    { campo: "debitos", titulo: "DÉBITOS", ancho: 1.6, alinear: "derecha", formato: (v) => formatearMoneda(Number(v ?? 0)) },
    { campo: "creditos", titulo: "CRÉDITOS", ancho: 1.6, alinear: "derecha", formato: (v) => formatearMoneda(Number(v ?? 0)) },
    { campo: "saldo", titulo: "SALDO", ancho: 1.6, alinear: "derecha", formato: (v) => formatearMoneda(Number(v ?? 0)) },
  ];

  const filas: Fila[] = datos.cuentas.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    naturaleza: c.naturaleza.slice(0, 4),
    debitos: c.debitos,
    creditos: c.creditos,
    saldo: c.saldo,
  }));

  const pdf = new DocumentoPdf({ empresa, titulo: "LIBRO MAYOR", subtitulo: periodo });
  pdf.tabla(columnas, filas);
  pdf.filaTotal(columnas, { nombre: "TOTALES", debitos: datos.totalDebitos, creditos: datos.totalCreditos, saldo: "" });
  return pdf.fin();
}

export async function libroMayorPdf(req: Request, res: Response): Promise<void> {
  const empresa = await obtenerEmpresa(req.empresaId!);
  responderPdf(res, await generarPdfLibroMayor(empresa, req), "libro-mayor.pdf");
}

function filasBalance(grupos: { grupo: string; nombre: string; cuentas: { codigo: string; nombre: string; saldo: number }[]; total: number }[]): Fila[] {
  const filas: Fila[] = [];
  for (const g of grupos) {
    filas.push({ codigo: g.grupo, nombre: g.nombre, saldo: g.total, __resaltar: "true" });
    for (const c of g.cuentas) {
      filas.push({ codigo: c.codigo, nombre: c.nombre, saldo: c.saldo });
    }
  }
  return filas;
}

const columnasSaldo: Columna[] = [
  { campo: "codigo", titulo: "CÓDIGO", ancho: 1.1, alinear: "centro" },
  { campo: "nombre", titulo: "CUENTA", ancho: 4.4 },
  { campo: "saldo", titulo: "SALDO", ancho: 1.9, alinear: "derecha", formato: (v) => formatearMoneda(Number(v ?? 0)) },
];

const resaltar = (fila: Fila) => fila.__resaltar === "true";

export async function generarPdfLibroInventarios(empresa: DatosEmpresa, req: Request): Promise<Buffer> {
  const [datos, periodo] = await Promise.all([datosBalanceGeneral(whereFiltros(req), req.empresaId!), textoPeriodo(req)]);

  const pdf = new DocumentoPdf({ empresa, titulo: "LIBRO DE INVENTARIOS Y BALANCES", subtitulo: periodo });

  pdf.tituloSeccion("ACTIVO");
  pdf.tabla(columnasSaldo, filasBalance(datos.activo), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL ACTIVO", saldo: datos.totalActivo }, { fondo: "#e2e8f0" });

  pdf.tituloSeccion("PASIVO");
  pdf.tabla(columnasSaldo, filasBalance(datos.pasivo), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL PASIVO", saldo: datos.totalPasivo }, { fondo: "#e2e8f0" });

  pdf.tituloSeccion("PATRIMONIO");
  pdf.tabla(columnasSaldo, filasBalance(datos.patrimonio), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL PATRIMONIO", saldo: datos.totalPatrimonio }, { fondo: "#e2e8f0" });

  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL PASIVO + PATRIMONIO", saldo: datos.totalPasivo + datos.totalPatrimonio }, { fondo: "#fde68a" });
  if (!datos.ecuacionOK) pdf.parrafo("ADVERTENCIA: el activo no cuadra con la suma de pasivo y patrimonio.");

  pdf.firma("Certifico que los valores consignados en este libro de inventarios corresponden fielmente a los saldos registrados en la contabilidad al cierre del periodo.");
  return pdf.fin();
}

export async function libroInventariosPdf(req: Request, res: Response): Promise<void> {
  const empresa = await obtenerEmpresa(req.empresaId!);
  responderPdf(res, await generarPdfLibroInventarios(empresa, req), "libro-inventarios.pdf");
}

export async function generarPdfBalanceGeneral(empresa: DatosEmpresa, req: Request): Promise<Buffer> {
  const [datos, periodo] = await Promise.all([datosBalanceGeneral(whereFiltros(req), req.empresaId!), textoPeriodo(req)]);

  const pdf = new DocumentoPdf({ empresa, titulo: "BALANCE GENERAL", subtitulo: periodo });

  pdf.tituloSeccion("ACTIVO");
  pdf.tabla(columnasSaldo, filasBalance(datos.activo), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL ACTIVO", saldo: datos.totalActivo }, { fondo: "#e2e8f0" });

  pdf.tituloSeccion("PASIVO");
  pdf.tabla(columnasSaldo, filasBalance(datos.pasivo), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL PASIVO", saldo: datos.totalPasivo }, { fondo: "#e2e8f0" });

  pdf.tituloSeccion("PATRIMONIO");
  pdf.tabla(columnasSaldo, filasBalance(datos.patrimonio), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL PATRIMONIO", saldo: datos.totalPatrimonio }, { fondo: "#e2e8f0" });

  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL PASIVO + PATRIMONIO", saldo: datos.totalPasivo + datos.totalPatrimonio }, { fondo: "#fde68a" });
  if (!datos.ecuacionOK) pdf.parrafo("ADVERTENCIA: el activo no cuadra con la suma de pasivo y patrimonio.");

  pdf.firma("Certifico que los valores consignados en este balance general corresponden fielmente a los saldos registrados en la contabilidad al cierre del periodo.");
  return pdf.fin();
}

export async function balanceGeneralPdf(req: Request, res: Response): Promise<void> {
  const empresa = await obtenerEmpresa(req.empresaId!);
  responderPdf(res, await generarPdfBalanceGeneral(empresa, req), "balance-general.pdf");
}

export async function generarPdfEstadoResultados(empresa: DatosEmpresa, req: Request): Promise<Buffer> {
  const [datos, periodo] = await Promise.all([datosEstadoResultados(whereFiltros(req), req.empresaId!), textoPeriodo(req)]);

  const pdf = new DocumentoPdf({ empresa, titulo: "ESTADO DE RESULTADOS", subtitulo: periodo });

  pdf.tituloSeccion("INGRESOS");
  pdf.tabla(columnasSaldo, filasBalance(datos.ingresos), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL INGRESOS", saldo: datos.totalIngresos }, { fondo: "#e2e8f0" });

  pdf.tituloSeccion("COSTOS");
  pdf.tabla(columnasSaldo, filasBalance(datos.costos), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL COSTOS", saldo: datos.totalCostos }, { fondo: "#e2e8f0" });

  pdf.tituloSeccion("GASTOS");
  pdf.tabla(columnasSaldo, filasBalance(datos.gastos), { resaltar });
  pdf.filaTotal(columnasSaldo, { nombre: "TOTAL GASTOS", saldo: datos.totalGastos }, { fondo: "#e2e8f0" });

  pdf.filaTotal(columnasSaldo, { nombre: "RESULTADO DEL EJERCICIO", saldo: datos.resultado }, { fondo: "#fde68a" });

  pdf.firma("Certifico que los valores consignados en este estado de resultados corresponden fielmente a los saldos registrados en la contabilidad al cierre del periodo.");
  return pdf.fin();
}

export async function estadoResultadosPdf(req: Request, res: Response): Promise<void> {
  const empresa = await obtenerEmpresa(req.empresaId!);
  responderPdf(res, await generarPdfEstadoResultados(empresa, req), "estado-resultados.pdf");
}

export async function generarPdfIndicadores(empresa: DatosEmpresa, periodoId: number): Promise<Buffer> {
  const datos = await obtenerDatosIndicadores(periodoId);
  if (!datos) throw new Error("Periodo no encontrado");

  const r = datos.razones;
  const columnas: Columna[] = [
    { campo: "indicador", titulo: "INDICADOR", ancho: 2.4 },
    { campo: "valor", titulo: "VALOR", ancho: 1.4, alinear: "derecha" },
  ];
  const filas: Fila[] = [
    { indicador: "Razón corriente", valor: r.razonCorriente ?? "" },
    { indicador: "Prueba ácida", valor: r.pruebaAcida ?? "" },
    { indicador: "Nivel de endeudamiento (%)", valor: r.endeudamiento ?? "" },
    { indicador: "Margen neto (%)", valor: r.margenNeto ?? "" },
    { indicador: "Rotación de cartera (días)", valor: r.rotacionCartera ?? "" },
    { indicador: "Rotación de inventario (días)", valor: r.rotacionInventario ?? "" },
  ];

  const pdf = new DocumentoPdf({ empresa, titulo: "INDICADORES FINANCIEROS", subtitulo: `Periodo: ${datos.periodo.nombre}` });
  pdf.tabla(columnas, filas);
  pdf.firma("Indicadores calculados sobre los saldos contabilizados del periodo seleccionado.");
  return pdf.fin();
}

export async function indicadoresPdf(req: Request, res: Response): Promise<void> {
  const periodoId = Number(req.params.periodoId);
  if (!Number.isInteger(periodoId)) {
    res.status(400).json({ error: "periodoId inválido" });
    return;
  }
  const empresa = await obtenerEmpresa(req.empresaId!);
  try {
    responderPdf(res, await generarPdfIndicadores(empresa, periodoId), "indicadores.pdf");
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
}
