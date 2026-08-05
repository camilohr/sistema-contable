#!/usr/bin/env node
// Utilidad ZIP mínima (método STORE) para empaquetar/desempaquetar la carpeta de
// adjuntos en los respaldos. No comprime: el contenido ya suele ser ofimático o
// PDF y lo importante es empaquetar todo en un único archivo junto al .dump.

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const TIPO_ZIP = "contabilidad-adjuntos";

function crc32(buf) {
  let c;
  const table = crcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let tablaCache;
function crcTable() {
  if (tablaCache) return tablaCache;
  tablaCache = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tablaCache[n] = c >>> 0;
  }
  return tablaCache;
}

function fechaDos(d) {
  const year = Math.max(1980, d.getFullYear());
  return ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
}

function horaDos(d) {
  return (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
}

async function archivosDeCarpeta(carpeta) {
  const resultados = [];
  async function recorrer(rel) {
    const ruta = path.join(carpeta, rel);
    const st = await stat(ruta);
    if (st.isDirectory()) {
      const hijos = await readdir(ruta);
      for (const h of hijos.sort()) await recorrer(path.join(rel, h));
    } else {
      resultados.push({ rel: rel.split(path.sep).join("/"), ruta, size: st.size, mtime: st.mtime });
    }
  }
  try {
    await recorrer("");
  } catch {
    return [];
  }
  return resultados;
}

export async function crearZipDesdeCarpeta(carpeta) {
  const archivos = await archivosDeCarpeta(carpeta);
  const partes = [];
  const central = [];
  let offset = 0;

  for (const a of archivos) {
    const contenido = await readFile(a.ruta);
    const nombreBuf = Buffer.from(a.rel, "utf8");
    const crc = crc32(contenido);
    const d = new Date(a.mtime);

    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(0x04034b50, 0);
    cabecera.writeUInt16LE(20, 4);
    cabecera.writeUInt16LE(0x0800, 6);
    cabecera.writeUInt16LE(0, 8);
    cabecera.writeUInt16LE(horaDos(d), 10);
    cabecera.writeUInt16LE(fechaDos(d), 12);
    cabecera.writeUInt32LE(crc, 14);
    cabecera.writeUInt32LE(contenido.length, 18);
    cabecera.writeUInt32LE(contenido.length, 22);
    cabecera.writeUInt16LE(nombreBuf.length, 26);

    partes.push(cabecera, nombreBuf, contenido);

    const regCentral = Buffer.alloc(46);
    regCentral.writeUInt32LE(0x02014b50, 0);
    regCentral.writeUInt16LE(20, 4);
    regCentral.writeUInt16LE(20, 6);
    regCentral.writeUInt16LE(0x0800, 8);
    regCentral.writeUInt16LE(0, 10);
    regCentral.writeUInt16LE(0, 12);
    regCentral.writeUInt16LE(fechaDos(d), 14);
    regCentral.writeUInt16LE(horaDos(d), 16);
    regCentral.writeUInt32LE(crc, 16);
    regCentral.writeUInt32LE(contenido.length, 20);
    regCentral.writeUInt32LE(contenido.length, 24);
    regCentral.writeUInt16LE(nombreBuf.length, 28);
    regCentral.writeUInt16LE(0, 30);
    regCentral.writeUInt16LE(0, 32);
    regCentral.writeUInt16LE(0, 34);
    regCentral.writeUInt16LE(0, 36);
    regCentral.writeUInt32LE(0, 38);
    regCentral.writeUInt32LE(offset, 42);

    central.push(regCentral, nombreBuf);
    offset += 30 + nombreBuf.length + contenido.length;
  }

  const centralBuf = Buffer.concat(central);
  const finCentral = Buffer.alloc(22);
  finCentral.writeUInt32LE(0x06054b50, 0);
  finCentral.writeUInt16LE(0, 4);
  finCentral.writeUInt16LE(0, 6);
  finCentral.writeUInt16LE(archivos.length, 8);
  finCentral.writeUInt16LE(archivos.length, 10);
  finCentral.writeUInt32LE(centralBuf.length, 12);
  finCentral.writeUInt32LE(offset, 16);
  finCentral.writeUInt16LE(0, 20);

  return Buffer.concat([...partes, centralBuf, finCentral]);
}

export async function extraerZip(carpetaZip, destino) {
  const buf = await readFile(carpetaZip);
  const zip = leerZip(buf);
  await mkdir(destino, { recursive: true });
  for (const entrada of zip.entradas) {
    if (!entrada.nombre || entrada.nombre.endsWith("/")) continue;
    const ruta = path.join(destino, entrada.nombre);
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, entrada.contenido);
  }
  return zip;
}

function leerZip(buf) {
  const len = buf.length;
  let eocd = -1;
  for (let i = len - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`No se encontró el fin del ZIP (${TIPO_ZIP})`);
  const numEntradas = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  const entradas = [];
  let pos = centralOffset;
  for (let i = 0; i < numEntradas; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("ZIP corrupto: entrada central inválida");
    const nombreLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const comentarioLen = buf.readUInt16LE(pos + 32);
    const crcEsperado = buf.readUInt32LE(pos + 16);
    const tamanio = buf.readUInt32LE(pos + 24);
    const offsetLocal = buf.readUInt32LE(pos + 42);
    const nombre = buf.toString("utf8", pos + 46, pos + 46 + nombreLen);
    entradas.push({ nombre, crcEsperado, tamanio, offsetLocal });
    pos += 46 + nombreLen + extraLen + comentarioLen;
  }
  for (const e of entradas) {
    const local = e.offsetLocal;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`ZIP corrupto: cabecera local de "${e.nombre}"`);
    const nombreLen = buf.readUInt16LE(local + 26);
    const extraLen = buf.readUInt16LE(local + 28);
    const datosOffset = local + 30 + nombreLen + extraLen;
    e.contenido = buf.subarray(datosOffset, datosOffset + e.tamanio);
    if (crc32(e.contenido) !== e.crcEsperado) throw new Error(`ZIP corrupto: CRC inválido en "${e.nombre}"`);
  }
  return { entradas };
}

export async function escribirZipDesdeCarpeta(carpeta, rutaZip) {
  const contenido = await crearZipDesdeCarpeta(carpeta);
  await mkdir(path.dirname(rutaZip), { recursive: true });
  await writeFile(rutaZip, contenido);
  return contenido.length;
}
