import { Request, Response } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { crearZip } from "../lib/zip.js";
import { DatosEmpresa, formatearFecha } from "../lib/pdf.js";
import {
  datosLibroDiario,
  datosLibroMayor,
  datosBalanceComprobacion,
  datosBalanceGeneral,
  datosEstadoResultados,
  whereFiltros,
} from "./reportes.controller.js";
import { obtenerDatosIndicadores } from "./indicadores.controller.js";
import {
  generarPdfLibroDiario,
  generarPdfLibroMayor,
  generarPdfLibroInventarios,
  generarPdfBalanceGeneral,
  generarPdfEstadoResultados,
  generarPdfIndicadores,
} from "./libros-pdf.controller.js";

export type TipoReporte = "libro-diario" | "libro-mayor" | "balance-comprobacion" | "balance-general" | "estado-resultados" | "indicadores";
export type FormatoExportacion = "csv" | "xlsx";

export interface TablaDatos {
  hoja: string;
  encabezados: string[];
  filas: (string | number | null)[][];
}

function reqFiltro(empresaId: string, periodoId?: number, cuentaId?: number): Request {
  return {
    empresaId,
    query: {
      periodoId: periodoId ? String(periodoId) : undefined,
      cuentaId: cuentaId ? String(cuentaId) : undefined,
    },
  } as unknown as Request;
}

async function obtenerEmpresa(empresaId: string): Promise<DatosEmpresa> {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  return e
    ? { nombreEmpresa: e.nombre, nit: e.nit, direccion: e.direccion ?? undefined, telefono: e.telefono ?? undefined }
    : { nombreEmpresa: "Empresa", nit: "000000000" };
}

async function datosTabulares(tipo: TipoReporte, req: Request): Promise<TablaDatos> {
  const where = whereFiltros(req);
  switch (tipo) {
    case "libro-diario": {
      const d = await datosLibroDiario(where);
      return {
        hoja: "Libro diario",
        encabezados: ["Ref", "Fecha", "Concepto", "Cuenta", "Nombre de la cuenta", "Tercero", "Débito", "Crédito"],
        filas: d.lineas.map((l) => [
          l.ref,
          formatearFecha(l.fecha.toISOString()),
          l.concepto,
          l.codigoCuenta,
          l.nombreCuenta,
          l.tercero ?? "",
          l.debito,
          l.credito,
        ]),
      };
    }
    case "libro-mayor": {
      const cuentaId = req.query.cuentaId ? Number(req.query.cuentaId) : undefined;
      const d = await datosLibroMayor(where, cuentaId);
      return {
        hoja: "Libro mayor",
        encabezados: ["Código", "Cuenta", "Naturaleza", "Débitos", "Créditos", "Saldo"],
        filas: d.cuentas.map((c) => [c.codigo, c.nombre, c.naturaleza, c.debitos, c.creditos, c.saldo]),
      };
    }
    case "balance-comprobacion": {
      const d = await datosBalanceComprobacion(where);
      return {
        hoja: "Balance de comprobación",
        encabezados: ["Código", "Cuenta", "Clase", "Naturaleza", "Débitos", "Créditos", "Saldo deudor", "Saldo acreedor"],
        filas: d.cuentas.map((c) => [c.codigo, c.nombre, c.clase, c.naturaleza, c.debitos, c.creditos, c.saldoDeudor, c.saldoAcreedor]),
      };
    }
    case "balance-general": {
      const d = await datosBalanceGeneral(where, req.empresaId!);
      const seccion = (titulo: string, grupos: typeof d.activo) => {
        const filas: (string | number | null)[][] = [[titulo, "", ""]];
        for (const g of grupos) {
          filas.push([g.grupo, g.nombre, g.total]);
          for (const c of g.cuentas) filas.push([c.codigo, c.nombre, c.saldo]);
        }
        return filas;
      };
      const filas = [
        ...seccion("ACTIVO", d.activo),
        ["TOTAL ACTIVO", "", d.totalActivo],
        ...seccion("PASIVO", d.pasivo),
        ["TOTAL PASIVO", "", d.totalPasivo],
        ...seccion("PATRIMONIO", d.patrimonio),
        ["TOTAL PATRIMONIO", "", d.totalPatrimonio],
        ["TOTAL PASIVO + PATRIMONIO", "", d.totalPasivo + d.totalPatrimonio],
        ["RESULTADO DEL EJERCICIO", "", d.resultado],
      ];
      return { hoja: "Balance general", encabezados: ["Cuenta", "Nombre", "Saldo"], filas };
    }
    case "estado-resultados": {
      const d = await datosEstadoResultados(where, req.empresaId!);
      const seccion = (titulo: string, grupos: typeof d.ingresos) => {
        const filas: (string | number | null)[][] = [[titulo, "", ""]];
        for (const g of grupos) {
          filas.push([g.grupo, g.nombre, g.total]);
          for (const c of g.cuentas) filas.push([c.codigo, c.nombre, c.saldo]);
        }
        return filas;
      };
      const filas = [
        ...seccion("INGRESOS", d.ingresos),
        ["TOTAL INGRESOS", "", d.totalIngresos],
        ...seccion("COSTOS", d.costos),
        ["TOTAL COSTOS", "", d.totalCostos],
        ...seccion("GASTOS", d.gastos),
        ["TOTAL GASTOS", "", d.totalGastos],
        ["RESULTADO DEL EJERCICIO", "", d.resultado],
      ];
      return { hoja: "Estado de resultados", encabezados: ["Cuenta", "Nombre", "Saldo"], filas };
    }
    case "indicadores": {
      const periodoId = Number(req.query.periodoId);
      if (!Number.isInteger(periodoId)) throw new Error("Se requiere periodoId");
      const d = await obtenerDatosIndicadores(periodoId, req.empresaId!);
      if (!d) throw new Error("Periodo no encontrado");
      const r = d.razones;
      return {
        hoja: "Indicadores",
        encabezados: ["Indicador", "Valor"],
        filas: [
          ["Razón corriente", r.razonCorriente],
          ["Prueba ácida", r.pruebaAcida],
          ["Nivel de endeudamiento (%)", r.endeudamiento],
          ["Margen neto (%)", r.margenNeto],
          ["Rotación de cartera (días)", r.rotacionCartera],
          ["Rotación de inventario (días)", r.rotacionInventario],
        ],
      };
    }
  }
}

function aCsv(tabla: TablaDatos): Buffer {
  const escape = (v: string | number | null): string => {
    const s = String(v ?? "");
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [tabla.encabezados.map(escape).join(";"), ...tabla.filas.map((f) => f.map(escape).join(";"))];
  return Buffer.from(`\uFEFF${lineas.join("\r\n")}`, "utf8");
}

async function aXlsx(tabla: TablaDatos): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema Contable";
  const ws = workbook.addWorksheet(tabla.hoja, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(tabla.encabezados);
  for (const fila of tabla.filas) ws.addRow(fila.map((v) => v ?? ""));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { horizontal: "center" };
  ws.columns.forEach((col, i) => {
    const valores: unknown[] = (ws.getColumn(i + 1).values as unknown[]).filter((v) => v !== undefined);
    const max = Math.max(8, ...valores.map((v) => String(v ?? "").length));
    col.width = Math.min(max + 2, 45);
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function responderArchivo(res: Response, buffer: Buffer, nombreArchivo: string, mime: string): void {
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
}

export async function exportarReporte(tipo: TipoReporte, formato: FormatoExportacion, req: Request, res: Response): Promise<void> {
  let tabla: TablaDatos;
  try {
    tabla = await datosTabulares(tipo, req);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }
  const nombreBase = `reporte-${tipo}`;
  if (formato === "csv") {
    responderArchivo(res, aCsv(tabla), `${nombreBase}.csv`, "text/csv; charset=utf-8");
  } else {
    responderArchivo(res, await aXlsx(tabla), `${nombreBase}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
}

async function periodosEnAlcance(empresaId: string, periodoId?: number, anio?: number) {
  if (periodoId) {
    const p = await prisma.periodo.findFirst({ where: { id: periodoId, empresaId } });
    return p ? [p] : [];
  }
  if (anio) {
    return prisma.periodo.findMany({ where: { empresaId, fechaInicio: { gte: new Date(`${anio}-01-01`), lte: new Date(`${anio}-12-31`) } }, orderBy: { fechaInicio: "asc" } });
  }
  return [];
}

export async function paqueteParaEmpresa(
  empresaId: string,
  periodoId?: number,
  anio?: number
): Promise<{ buffer: Buffer; nombreArchivo: string } | null> {
  const empresa = await obtenerEmpresa(empresaId);
  const periodos = await periodosEnAlcance(empresaId, periodoId, anio);
  if (periodos.length === 0) return null;

  const archivos: { nombre: string; contenido: Buffer }[] = [];
  for (const p of periodos) {
    const reqP = reqFiltro(empresaId, p.id);
    const generadores = [
      { archivo: "libro-diario.pdf", fn: () => generarPdfLibroDiario(empresa, reqP) },
      { archivo: "libro-mayor.pdf", fn: () => generarPdfLibroMayor(empresa, reqP) },
      { archivo: "libro-inventarios.pdf", fn: () => generarPdfLibroInventarios(empresa, reqP) },
      { archivo: "balance-general.pdf", fn: () => generarPdfBalanceGeneral(empresa, reqP) },
      { archivo: "estado-resultados.pdf", fn: () => generarPdfEstadoResultados(empresa, reqP) },
      { archivo: "indicadores.pdf", fn: () => generarPdfIndicadores(empresa, p.id, empresaId) },
    ];
    for (const g of generadores) {
      archivos.push({ nombre: `${p.nombre}/${g.archivo}`, contenido: await g.fn() });
    }
  }

  return { buffer: crearZip(archivos), nombreArchivo: `informes-${anio ?? periodos[0].nombre}.zip` };
}

export async function paqueteInformes(req: Request, res: Response): Promise<void> {
  const periodoId = req.body?.periodoId ? Number(req.body.periodoId) : undefined;
  const anio = req.body?.anio ? Number(req.body.anio) : undefined;
  if (!periodoId && !anio) {
    res.status(400).json({ error: "Se requiere 'periodoId' o 'anio'" });
    return;
  }

  const resultado = await paqueteParaEmpresa(req.empresaId!, periodoId, anio);
  if (!resultado) {
    res.status(404).json({ error: "No se encontraron periodos para el alcance indicado" });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${resultado.nombreArchivo}"`);
  res.setHeader("Content-Length", resultado.buffer.length);
  res.send(resultado.buffer);
}

export async function paqueteFinalBaja(req: Request, res: Response): Promise<void> {
  const periodoId = req.body?.periodoId ? Number(req.body.periodoId) : undefined;
  const anio = req.body?.anio ? Number(req.body.anio) : undefined;
  if (!periodoId && !anio) {
    res.status(400).json({ error: "Se requiere 'periodoId' o 'anio'" });
    return;
  }
  const empresa = await prisma.empresa.findUnique({ where: { id: req.params.empresaId } });
  if (!empresa) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }

  const resultado = await paqueteParaEmpresa(empresa.id, periodoId, anio);
  if (!resultado) {
    res.status(404).json({ error: "No se encontraron periodos para el alcance indicado" });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${resultado.nombreArchivo}"`);
  res.setHeader("Content-Length", resultado.buffer.length);
  res.send(resultado.buffer);
}
