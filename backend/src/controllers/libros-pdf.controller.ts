import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { DocumentoPdf, Columna, Fila, DatosEmpresa, formatearMoneda, formatearFecha } from "../lib/pdf.js";
import { datosBalanceGeneral, datosLibroDiario, datosLibroMayor, whereFiltros } from "./reportes.controller.js";

async function obtenerEmpresa(): Promise<DatosEmpresa> {
  const p = await prisma.parametro.findFirst();
  return p
    ? { nombreEmpresa: p.nombreEmpresa, nit: p.nit, direccion: p.direccion, telefono: p.telefono }
    : { nombreEmpresa: "Empresa", nit: "000000000" };
}

async function textoPeriodo(req: Request): Promise<string> {
  const periodoId = req.query.periodoId ? Number(req.query.periodoId) : undefined;
  if (periodoId) {
    const p = await prisma.periodo.findUnique({ where: { id: periodoId } });
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

export async function libroDiarioPdf(req: Request, res: Response): Promise<void> {
  const [empresa, datos, periodo] = await Promise.all([obtenerEmpresa(), datosLibroDiario(whereFiltros(req)), textoPeriodo(req)]);

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

  responderPdf(res, await pdf.fin(), "libro-diario.pdf");
}

export async function libroMayorPdf(req: Request, res: Response): Promise<void> {
  const cuentaId = req.query.cuentaId ? Number(req.query.cuentaId) : undefined;
  const [empresa, datos, periodo] = await Promise.all([
    obtenerEmpresa(),
    datosLibroMayor(whereFiltros(req), cuentaId),
    textoPeriodo(req),
  ]);

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

  responderPdf(res, await pdf.fin(), "libro-mayor.pdf");
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

export async function libroInventariosPdf(req: Request, res: Response): Promise<void> {
  const [empresa, datos, periodo] = await Promise.all([
    obtenerEmpresa(),
    datosBalanceGeneral(whereFiltros(req)),
    textoPeriodo(req),
  ]);

  const columnas: Columna[] = [
    { campo: "codigo", titulo: "CÓDIGO", ancho: 1.1, alinear: "centro" },
    { campo: "nombre", titulo: "CUENTA", ancho: 4.4 },
    { campo: "saldo", titulo: "SALDO", ancho: 1.9, alinear: "derecha", formato: (v) => formatearMoneda(Number(v ?? 0)) },
  ];
  const resaltar = (fila: Fila) => fila.__resaltar === "true";

  const pdf = new DocumentoPdf({ empresa, titulo: "LIBRO DE INVENTARIOS Y BALANCES", subtitulo: periodo });

  pdf.tituloSeccion("ACTIVO");
  pdf.tabla(columnas, filasBalance(datos.activo), { resaltar });
  pdf.filaTotal(columnas, { nombre: "TOTAL ACTIVO", saldo: datos.totalActivo }, { fondo: "#e2e8f0" });

  pdf.tituloSeccion("PASIVO");
  pdf.tabla(columnas, filasBalance(datos.pasivo), { resaltar });
  pdf.filaTotal(columnas, { nombre: "TOTAL PASIVO", saldo: datos.totalPasivo }, { fondo: "#e2e8f0" });

  pdf.tituloSeccion("PATRIMONIO");
  pdf.tabla(columnas, filasBalance(datos.patrimonio), { resaltar });
  pdf.filaTotal(columnas, { nombre: "TOTAL PATRIMONIO", saldo: datos.totalPatrimonio }, { fondo: "#e2e8f0" });

  pdf.filaTotal(columnas, { nombre: "TOTAL PASIVO + PATRIMONIO", saldo: datos.totalPasivo + datos.totalPatrimonio }, { fondo: "#fde68a" });
  if (!datos.ecuacionOK) pdf.parrafo("ADVERTENCIA: el activo no cuadra con la suma de pasivo y patrimonio.");

  pdf.firma("Certifico que los valores consignados en este libro de inventarios corresponden fielmente a los saldos registrados en la contabilidad al cierre del periodo.");

  responderPdf(res, await pdf.fin(), "libro-inventarios.pdf");
}
