import PDFDocument from "pdfkit";

export type Alineacion = "izquierda" | "derecha" | "centro";

export interface Columna {
  campo: string;
  titulo: string;
  ancho: number;
  alinear?: Alineacion;
  formato?: (valor: string | number | null) => string;
}

export type Fila = Record<string, string | number | null>;

export interface DatosEmpresa {
  nombreEmpresa: string;
  nit: string;
  direccion?: string | null;
  telefono?: string | null;
}

export function formatearMoneda(n: number): string {
  const signo = n < 0 ? "-" : "";
  const entero = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${signo}$${entero}`;
}

export function formatearFecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const MARGEN = 40;
const ALTO_ENCABEZADO = 124;
const PIE = 30;

interface OpcionesDocumento {
  empresa: DatosEmpresa;
  titulo: string;
  subtitulo?: string;
}

export class DocumentoPdf {
  private doc: PDFKit.PDFDocument;
  private chunks: Buffer[] = [];
  private empresa: DatosEmpresa;
  private titulo: string;
  private subtitulo: string;
  private y = 0;
  private folio = 0;

  constructor(opts: OpcionesDocumento) {
    this.empresa = opts.empresa;
    this.titulo = opts.titulo;
    this.subtitulo = opts.subtitulo ?? "";
    this.doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
      bufferPages: true,
      info: { Title: opts.titulo, Author: opts.empresa.nombreEmpresa },
    });
    this.doc.on("data", (c: Buffer) => this.chunks.push(c));
    this.doc.on("pageAdded", () => this.nuevaPagina());
    this.nuevaPagina();
  }

  get anchoContenido(): number {
    return this.doc.page.width - MARGEN * 2;
  }

  private fondo(): number {
    return this.doc.page.height - MARGEN - PIE;
  }

  private nuevaPagina(): void {
    this.folio += 1;
    this.dibujarCabecera();
    this.dibujarPie();
    this.y = ALTO_ENCABEZADO + 6;
  }

  private textoCentrado(texto: string, y: number, fuente: "Helvetica" | "Helvetica-Bold", tamano: number, color = "#000"): void {
    const d = this.doc;
    d.font(fuente).fontSize(tamano).fillColor(color);
    const ancho = d.widthOfString(texto);
    d.text(texto, MARGEN + (this.anchoContenido - ancho) / 2, y, { lineBreak: false });
  }

  private textoDerecha(texto: string, y: number, tamano: number, color = "#000"): void {
    const d = this.doc;
    d.font("Helvetica").fontSize(tamano).fillColor(color);
    const ancho = d.widthOfString(texto);
    d.text(texto, MARGEN + this.anchoContenido - ancho, y, { lineBreak: false });
  }

  private dibujarCabecera(): void {
    const d = this.doc;
    this.textoCentrado(this.empresa.nombreEmpresa, MARGEN, "Helvetica-Bold", 13);
    this.textoCentrado(`NIT: ${this.empresa.nit}`, MARGEN + 18, "Helvetica", 9);
    const info = [this.empresa.direccion, this.empresa.telefono].filter(Boolean).join("  ·  ");
    if (info) this.textoCentrado(info, MARGEN + 31, "Helvetica", 9);
    this.textoCentrado(this.titulo, MARGEN + 52, "Helvetica-Bold", 12);
    if (this.subtitulo) this.textoCentrado(this.subtitulo, MARGEN + 70, "Helvetica", 9);
    d.moveTo(MARGEN, ALTO_ENCABEZADO).lineTo(MARGEN + this.anchoContenido, ALTO_ENCABEZADO).lineWidth(1).strokeColor("#000").stroke();
  }

  private dibujarPie(): void {
    const d = this.doc;
    const yPie = d.page.height - 20;
    d.font("Helvetica").fontSize(8).fillColor("#444");
    d.text(`Generado: ${new Date().toLocaleDateString("es-CO")}`, MARGEN, yPie, { lineBreak: false });
    this.textoDerecha(`Folio ${this.folio}`, yPie, 8, "#444");
    d.moveTo(MARGEN, yPie - 6).lineTo(MARGEN + this.anchoContenido, yPie - 6).lineWidth(0.5).strokeColor("#aaa").stroke();
  }

  tituloSeccion(texto: string): void {
    const d = this.doc;
    if (this.y + 20 > this.fondo()) this.doc.addPage();
    d.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    d.text(texto, MARGEN, this.y);
    this.y = d.y + 4;
  }

  parrafo(texto: string): void {
    const d = this.doc;
    if (this.y + 20 > this.fondo()) this.doc.addPage();
    d.font("Helvetica").fontSize(9).fillColor("#000");
    d.text(texto, MARGEN, this.y, { width: this.anchoContenido, lineGap: 4 });
    this.y = d.y + 6;
  }

  private layoutTabla(columnas: Columna[]): number[] {
    const anchoTotal = columnas.reduce((s, c) => s + c.ancho, 0);
    return columnas.map((c) => (c.ancho / anchoTotal) * this.anchoContenido);
  }

  private encabezadoTabla(columnas: Columna[], anchos: number[], tamano: number): void {
    const d = this.doc;
    d.font("Helvetica-Bold").fontSize(tamano);
    const altos = columnas.map((c, i) => d.heightOfString(c.titulo, { width: anchos[i] - 6 }));
    const alto = Math.max(...altos, tamano + 2) + 6;
    if (this.y + alto > this.fondo()) this.doc.addPage();
    d.rect(MARGEN, this.y, this.anchoContenido, alto).fill("#e2e8f0");
    let x = MARGEN;
    columnas.forEach((c, i) => {
      d.fillColor("#000").text(c.titulo, x + 3, this.y + 3, { width: anchos[i] - 6, align: "center" });
      x += anchos[i];
    });
    this.y += alto;
    d.moveTo(MARGEN, this.y).lineTo(MARGEN + this.anchoContenido, this.y).lineWidth(0.75).strokeColor("#000").stroke();
  }

  private escribirCeldas(columnas: Columna[], anchos: number[], textos: string[], tamano: number, negrita: boolean, alto: number, relleno?: string): void {
    const d = this.doc;
    if (relleno) d.rect(MARGEN, this.y, this.anchoContenido, alto).fill(relleno);
    d.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(tamano);
    let x = MARGEN;
    columnas.forEach((c, i) => {
      const alinear = c.alinear ?? "izquierda";
      d.fillColor("#000").text(textos[i], x + 3, this.y + 2, {
        width: anchos[i] - 6,
        align: alinear === "derecha" ? "right" : alinear === "centro" ? "center" : "left",
      });
      x += anchos[i];
    });
    this.y += alto;
    d.moveTo(MARGEN, this.y).lineTo(MARGEN + this.anchoContenido, this.y).lineWidth(0.5).strokeColor("#999").stroke();
  }

  tabla(columnas: Columna[], filas: Fila[], opts?: { tamano?: number; resaltar?: (fila: Fila) => boolean }): void {
    const d = this.doc;
    const tamano = opts?.tamano ?? 8;
    const anchos = this.layoutTabla(columnas);
    this.encabezadoTabla(columnas, anchos, tamano);
    for (const fila of filas) {
      const resaltar = opts?.resaltar?.(fila) ?? false;
      const textos = columnas.map((c) => (c.formato ? c.formato(fila[c.campo] ?? null) : String(fila[c.campo] ?? "")));
      const altos = columnas.map((c, i) => d.heightOfString(textos[i], { width: anchos[i] - 6 }));
      const alto = Math.max(...altos, tamano + 2) + 4;
      if (this.y + alto > this.fondo()) {
        this.doc.addPage();
        this.encabezadoTabla(columnas, anchos, tamano);
      }
      this.escribirCeldas(columnas, anchos, textos, tamano, resaltar, alto, resaltar ? "#f1f5f9" : undefined);
    }
    this.y += 4;
  }

  filaTotal(columnas: Columna[], valores: Fila, opts?: { tamano?: number; fondo?: string }): void {
    const d = this.doc;
    const tamano = opts?.tamano ?? 8;
    const anchos = this.layoutTabla(columnas);
    const textos = columnas.map((c) => (c.formato ? c.formato(valores[c.campo] ?? null) : String(valores[c.campo] ?? "")));
    const altos = columnas.map((c, i) => d.heightOfString(textos[i], { width: anchos[i] - 6 }));
    const alto = Math.max(...altos, tamano + 2) + 4;
    if (this.y + alto > this.fondo()) {
      this.doc.addPage();
      this.encabezadoTabla(columnas, anchos, tamano);
    }
    this.escribirCeldas(columnas, anchos, textos, tamano, true, alto, opts?.fondo ?? "#dbeafe");
    this.y += 4;
  }

  firma(texto: string): void {
    const d = this.doc;
    if (this.y + 90 > this.fondo()) this.doc.addPage();
    this.y += 8;
    d.font("Helvetica").fontSize(9).fillColor("#000");
    d.text(texto, MARGEN, this.y, { width: this.anchoContenido, lineGap: 4 });
    this.y = d.y + 26;
    d.moveTo(MARGEN, this.y).lineTo(MARGEN + 230, this.y).lineWidth(0.5).strokeColor("#000").stroke();
    d.text("Firma del contador público", MARGEN, this.y + 4);
    this.y += 30;
  }

  fin(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)));
      this.doc.on("error", reject);
      this.doc.end();
    });
  }
}
