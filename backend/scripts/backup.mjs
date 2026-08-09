#!/usr/bin/env node
// Respaldo de la base de datos con pg_dump (formato custom), verificación
// automática con pg_restore --list, informe por empresa (conteos por cliente con
// sus adjuntos, vía psql) y retención de copias.
//
// Uso:
//   node scripts/backup.mjs                       # crea un respaldo y aplica retención GFS
//   node scripts/backup.mjs --keep 30             # retención simple: las 30 copias más recientes
//   node scripts/backup.mjs --daily 30 --monthly 12 --annual 5  #调味 GFS
//   node scripts/backup.mjs --dir C:\respaldos    # carpeta de destino
//   node scripts/backup.mjs --list                # lista respaldos y verifica su integridad
//
// Variables de entorno opcionales:
//   PGDUMP_PATH    ruta explícita a pg_dump
//   PGRESTORE_PATH ruta explícita a pg_restore
//   BACKUP_COPIA_EXTERNA_DIR carpeta adicional a la que se copia el .dump y el
//                          adjuntos.zip tras verificar el respaldo (no fatal)
//   BACKUP_ENCRYPT_KEY frase de acceso para cifrar el .dump y el adjuntos.zip
//                          (AES-256-GCM, S1-10). Si se define, los respaldos se
//                          cifran en el momento de crearlos.
//
// Retención por defecto (GFS — abuelo-padre-hijo):
//   - Diarios: conserva todas las copias de los últimos 30 días.
//   - Mensuales: conserva la copia más reciente de cada mes de los últimos 12 meses.
//   - Anuales: conserva la copia más reciente de cada uno de los últimos 5 años
//     (alineado con el Estatuto Tributario, art. 632; configurable con --annual).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, appendFile, copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { escribirZipDesdeCarpeta, extraerZip } from "./zip-lite.mjs";
import { cifrarArchivo, esCifrado, baseDeCifrado } from "./cifrado.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(backendDir, ".env") });

const exec = promisify(execFile);

// Conteos por cliente (tablas con scoping directo por empresaId). Se ejecutan sobre
// la BD viva inmediatamente después del dump verificado: el respaldo es una copia
// íntegra, así que estos totales son los que debe contener el archivo.
const SQL_POR_EMPRESA = `
SELECT e.nombre,
  CASE WHEN e.activa THEN 'activa' ELSE 'inactiva' END,
  (SELECT count(*) FROM "Tercero" t WHERE t."empresaId" = e.id),
  (SELECT count(*) FROM "Periodo" p WHERE p."empresaId" = e.id),
  (SELECT count(*) FROM "Comprobante" c WHERE c."empresaId" = e.id),
  (SELECT count(*) FROM "CuentaPorCobrar" x WHERE x."empresaId" = e.id),
  (SELECT count(*) FROM "CuentaPorPagar" y WHERE y."empresaId" = e.id),
  (SELECT count(*) FROM "Producto" pr WHERE pr."empresaId" = e.id),
  (SELECT count(*) FROM "ActivoFijo" af WHERE af."empresaId" = e.id),
  (SELECT count(*) FROM "ProcesoContable" pc WHERE pc."empresaId" = e.id),
  (SELECT count(*) FROM "Conciliacion" cc WHERE cc."empresaId" = e.id),
  (SELECT count(*) FROM "Adjunto" a WHERE a."empresaId" = e.id),
  (SELECT count(*) FROM "UsuarioEmpresa" ue WHERE ue."empresaId" = e.id)
FROM "Empresa" e
ORDER BY e.nombre;
`;
const existe = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

function ahora() {
  const n = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}_${pad(n.getHours())}${pad(n.getMinutes())}${pad(n.getSeconds())}`;
}

function leerArgs() {
  const args = process.argv.slice(2);
  const opt = {
    keep: 14,
    keepMode: "gfs",
    daily: 30,
    monthly: 12,
    annual: 5,
    dir: path.resolve(backendDir, "..", "backups"),
    list: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keep") { opt.keep = Number(args[++i]); opt.keepMode = "simple"; }
    else if (args[i] === "--daily") opt.daily = Number(args[++i]);
    else if (args[i] === "--monthly") opt.monthly = Number(args[++i]);
    else if (args[i] === "--annual") opt.annual = Number(args[++i]);
    else if (args[i] === "--dir") opt.dir = path.resolve(args[++i]);
    else if (args[i] === "--list") opt.list = true;
  }
  return opt;
}

function parsearFechaBackup(f) {
  const m = f.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

function aplicarRetencion(dumps, opt) {
  if (opt.keepMode === "simple") {
    const sobrantes = dumps.slice().sort().reverse().slice(opt.keep);
    const eliminar = sobrantes;
    const mantener = new Set(dumps.filter((f) => !eliminar.includes(f)));
    return { mantener, eliminar, modo: `simple (keep=${opt.keep})` };
  }

  const ahora = new Date();
  const limiteDiario = new Date(ahora);
  limiteDiario.setDate(limiteDiario.getDate() - opt.daily);
  const limiteMensual = new Date(ahora);
  limiteMensual.setMonth(limiteMensual.getMonth() - opt.monthly);
  const anioMin = ahora.getFullYear() - opt.annual;

  const porMes = new Map();
  const porAnio = new Map();
  for (const f of dumps) {
    const fecha = parsearFechaBackup(f);
    if (!fecha) continue;
    const mesClave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const anioClave = `${fecha.getFullYear()}`;
    if (!porMes.has(mesClave)) porMes.set(mesClave, []);
    porMes.get(mesClave).push({ f, fecha });
    if (!porAnio.has(anioClave)) porAnio.set(anioClave, []);
    porAnio.get(anioClave).push({ f, fecha });
  }

  const eliminar = [];
  const mantener = new Set();

  const latest = (arr) => arr.sort((a, b) => b.fecha - a.fecha)[0];

  for (const f of dumps) {
    const fecha = parsearFechaBackup(f);
    if (!fecha) {
      mantener.add(f);
      continue;
    }
    let sobrevive = false;

    // Diarios: todos los de los últimos `opt.daily` días
    if (fecha >= limiteDiario) sobrevive = true;

    // Mensuales: el más reciente de cada mes dentro de los últimos `opt.monthly` meses
    const mesClave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const itemsMes = porMes.get(mesClave) || [];
    if (itemsMes.length > 0 && f === latest(itemsMes).f && fecha >= limiteMensual) {
      sobrevive = true;
    }

    // Anuales: el más reciente de cada año dentro de los últimos `opt.annual` años
    const anioClave = `${fecha.getFullYear()}`;
    const itemsAnio = porAnio.get(anioClave) || [];
    if (itemsAnio.length > 0 && f === latest(itemsAnio).f && Number(anioClave) >= anioMin) {
      sobrevive = true;
    }

    if (sobrevive) mantener.add(f);
    else eliminar.push(f);
  }

  return { mantener, eliminar, modo: `GFS (diarios=${opt.daily}, mensuales=${opt.monthly}, anuales=${opt.annual})` };
}

async function tool(nombre) {
  const envVar = process.env[`${nombre.toUpperCase()}_PATH`];
  if (envVar) return envVar;
  if (process.platform === "win32") {
    const base = process.env.ProgramFiles || "C:\\Program Files";
    try {
      const versiones = (await readdir(path.join(base, "PostgreSQL"))).sort().reverse();
      for (const v of versiones) {
        const candidato = path.join(base, "PostgreSQL", v, "bin", `${nombre}.exe`);
        if (await existe(candidato)) return candidato;
      }
    } catch {
      /* se usará PATH */
    }
  }
  return nombre;
}

async function registrar(logFile, linea) {
  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(logFile, `${new Date().toISOString()}  ${linea}\n`, "utf8");
}

async function verificar(pgRestore, archivo) {
  try {
    const { stdout } = await exec(pgRestore, ["--list", archivo]);
    const objetos = stdout.split("\n").filter((l) => !l.trim().startsWith(";") && l.trim().length > 0).length;
    return { ok: true, objetos };
  } catch {
    return { ok: false, objetos: 0 };
  }
}

async function verificarPorEmpresa(pg, dbUri, logFile) {
  const db = String(dbUri).split("?")[0];
  let stdout;
  try {
    ({ stdout } = await exec(pg, ["-At", "-F", "\t", "-c", SQL_POR_EMPRESA, db], { encoding: "utf8" }));
  } catch (err) {
    const msg = err.stderr?.trim() || err.message;
    console.warn(`AVISO: no se generó el informe por empresa (${msg}). El respaldo sigue siendo válido.`);
    await registrar(logFile, `ERROR por-empresa: ${msg}`);
    return;
  }
  const filas = stdout.split("\n").filter((l) => l.trim().length > 0).map((l) => l.split("\t"));
  if (filas.length === 0) {
    console.log("Por empresa: no hay clientes registrados.");
    await registrar(logFile, "OK por-empresa: 0 clientes");
    return;
  }
  const encabezados = ["Empresa", "Estado", "Terc", "Per", "Comp", "CxC", "CxP", "Prod", "Activos", "Proc", "Conc", "Adj", "Usr"];
  const anchos = encabezados.map((h, i) => Math.max(h.length, ...filas.map((r) => String(r[i] ?? "").length)));
  const fila = (celdas) => celdas.map((c, i) => String(c).padEnd(anchos[i])).join("  ");
  console.log("Verificación por empresa:");
  console.log(fila(encabezados));
  console.log(fila(encabezados.map((h, i) => "-".repeat(anchos[i]))));
  for (const r of filas) console.log(fila(r));
  const resumen = filas.map((r) => `${r[0]} (${r[4]} comp, ${r[11]} adj)`).join("; ");
  await registrar(logFile, `OK por-empresa: ${filas.length} cliente(s) - ${resumen}`);
}

async function copiaExterna(logFile, ruta, rutaAdjuntos) {
  const dir = process.env.BACKUP_COPIA_EXTERNA_DIR;
  if (!dir) {
    await registrar(logFile, "INFO copia-externa: omitida (BACKUP_COPIA_EXTERNA_DIR no definido)");
    return;
  }
  const destino = path.resolve(dir);
  if (!(await existe(destino))) {
    await registrar(logFile, `AVISO copia-externa: ${destino} no disponible; se omite la copia (respaldo local intacto)`);
    console.warn(`AVISO copia-externa: ${destino} no está disponible; se omite la copia.`);
    return;
  }
  await mkdir(destino, { recursive: true });
  for (const f of [ruta, rutaAdjuntos]) {
    if (!(await existe(f))) continue;
    try {
      const destinoArchivo = path.join(destino, path.basename(f));
      await copyFile(f, destinoArchivo);
      await registrar(logFile, `OK copia-externa ${path.basename(f)} -> ${destino}`);
      console.log(`Copia externa: ${path.basename(f)} -> ${destino}`);
    } catch (err) {
      await registrar(logFile, `ERROR copia-externa ${path.basename(f)}: ${err.message}`);
      console.warn(`ERROR copia-externa ${path.basename(f)}:`, err.message);
    }
  }
}

async function listar(opt, pgRestore) {
  await mkdir(opt.dir, { recursive: true });
  const archivos = (await readdir(opt.dir))
    .filter((f) => baseDeCifrado(f).endsWith(".dump") || baseDeCifrado(f).endsWith(".sql") || baseDeCifrado(f).endsWith(".adjuntos.zip"))
    .sort();
  if (archivos.length === 0) {
    console.log("No hay respaldos en", opt.dir);
    return;
  }
  console.log(`Respaldos en ${opt.dir}:`);
  for (const f of archivos) {
    const ruta = path.join(opt.dir, f);
    const st = await stat(ruta);
    if (baseDeCifrado(f).endsWith(".adjuntos.zip")) {
      const mb = (st.size / 1024 / 1024).toFixed(2);
      const cifra = esCifrado(f) ? " [cifrado]" : "";
      console.log(`  ${f.padEnd(32)} ${mb.padStart(8)} MB   adjuntos${cifra}`);
      continue;
    }
    let estado = { ok: null };
    if (f.endsWith(".dump")) estado = await verificar(pgRestore, ruta);
    const marca = estado.ok ? `OK (${estado.objetos} objetos)` : estado.ok === false ? "CORRUPTO" : esCifrado(f) ? "cifrado" : "—";
    const mb = (st.size / 1024 / 1024).toFixed(2);
    console.log(`  ${f.padEnd(32)} ${mb.padStart(8)} MB   ${marca}`);
  }
}

async function main() {
  const opt = leerArgs();
  const pgDump = await tool("pg_dump");
  const pgRestore = await tool("pg_restore");
  const pg = await tool("psql");

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: no se encontró DATABASE_URL en backend/.env");
    process.exit(1);
  }
  if (!opt.list && !(await existe(pgDump))) {
    console.error(`ERROR: no se encontró pg_dump (${pgDump}). Instale PostgreSQL o defina PGDUMP_PATH.`);
    process.exit(1);
  }

  await mkdir(opt.dir, { recursive: true });

  if (opt.list) {
    await listar(opt, pgRestore);
    return;
  }

  const nombre = `contabilidad_${ahora()}.dump`;
  const ruta = path.join(opt.dir, nombre);
  const logFile = path.join(opt.dir, "backup.log");
  const dbUri = String(process.env.DATABASE_URL).split("?")[0];

  console.log(`Creando respaldo: ${ruta}`);
  try {
    await exec(pgDump, ["-Fc", "-f", ruta, dbUri], { encoding: "utf8" });
  } catch (err) {
    await unlink(ruta).catch(() => {});
    await registrar(logFile, `ERROR respaldo ${ruta}: ${err.stderr?.trim() || err.message}`);
    console.error("ERROR al crear el respaldo:", err.stderr?.trim() || err.message);
    process.exit(1);
  }

  const verif = await verificar(pgRestore, ruta);
  if (!verif.ok) {
    await unlink(ruta).catch(() => {});
    await registrar(logFile, `RESPALDO CORRUPTO ${ruta}`);
    console.error("ERROR: el respaldo no pudo verificarse con pg_restore --list.");
    process.exit(1);
  }

  console.log(`Respaldo verificado: OK (${verif.objetos} objetos)`);

  const claveCifrado = process.env.BACKUP_ENCRYPT_KEY;
  const rutaAdjuntos = ruta.replace(/\.dump$/, ".adjuntos.zip");
  const adjuntosDir = process.env.ADJUNTOS_DIR ? path.resolve(process.env.ADJUNTOS_DIR) : path.join(backendDir, "adjuntos");
  if (await existe(adjuntosDir)) {
    try {
      const tam = await escribirZipDesdeCarpeta(adjuntosDir, rutaAdjuntos);
      console.log(`Adjuntos empaquetados: ${(tam / 1024 / 1024).toFixed(2)} MB`);
      await registrar(logFile, `OK adjuntos ${path.basename(rutaAdjuntos)} (${(tam / 1024).toFixed(0)} KB)`);
    } catch (err) {
      await unlink(rutaAdjuntos).catch(() => {});
      await registrar(logFile, `ERROR adjuntos: ${err.message}`);
      console.error("ERROR al empaquetar los adjuntos:", err.message);
    }
  }

  // S1-10: cifrar el respaldo (AES-256-GCM) si BACKUP_ENCRYPT_KEY está definida.
  let rutaFinalDump = ruta;
  let rutaFinalAdjuntos = rutaAdjuntos;
  if (claveCifrado) {
    try {
      const rutaEnc = `${ruta}.enc`;
      await cifrarArchivo(ruta, rutaEnc, claveCifrado);
      await unlink(ruta).catch(() => {});
      rutaFinalDump = rutaEnc;
      await registrar(logFile, `OK cifrado ${path.basename(rutaEnc)}`);
      console.log(`Respaldo cifrado: ${path.basename(rutaEnc)}`);
    } catch (err) {
      await registrar(logFile, `ERROR cifrado dump: ${err.message}`);
      console.error("ERROR al cifrar el respaldo:", err.message);
      process.exit(1);
    }
    if (await existe(rutaAdjuntos)) {
      try {
        const rutaAdjEnc = `${rutaAdjuntos}.enc`;
        await cifrarArchivo(rutaAdjuntos, rutaAdjEnc, claveCifrado);
        await unlink(rutaAdjuntos).catch(() => {});
        rutaFinalAdjuntos = rutaAdjEnc;
        await registrar(logFile, `OK cifrado ${path.basename(rutaAdjEnc)}`);
        console.log(`Adjuntos cifrados: ${path.basename(rutaAdjEnc)}`);
      } catch (err) {
        await registrar(logFile, `ERROR cifrado adjuntos: ${err.message}`);
        console.error("ERROR al cifrar los adjuntos:", err.message);
      }
    }
  }

  const dumps = (await readdir(opt.dir))
    .filter((f) => baseDeCifrado(f).endsWith(".dump") && !f.includes(".tmp"))
    .sort()
    .reverse();
  const retencion = aplicarRetencion(dumps, opt);
  for (const f of retencion.eliminar) {
    const base = baseDeCifrado(f);
    await unlink(path.join(opt.dir, f)).catch(() => {});
    await unlink(path.join(opt.dir, f.replace(/\.dump$/, ".adjuntos.zip"))).catch(() => {});
    await unlink(path.join(opt.dir, `${base}.adjuntos.zip.enc`)).catch(() => {});
    await registrar(logFile, `Eliminado por retención ${retencion.modo}: ${f}`);
    console.log(`Retención: eliminado ${f}`);
  }

  await verificarPorEmpresa(pg, dbUri, logFile);

  await copiaExterna(logFile, rutaFinalDump, rutaFinalAdjuntos);

  const st = await stat(rutaFinalDump);
  await registrar(
    logFile,
    `OK respaldo ${path.basename(rutaFinalDump)} (${(st.size / 1024).toFixed(0)} KB, ${verif.objetos} objetos, retención ${retencion.modo}${claveCifrado ? ", cifrado" : ""})`
  );
  console.log(`Listo. Quedan ${retencion.mantener.size} respaldo(s).`);
}

main().catch((err) => {
  console.error("ERROR inesperado:", err.message);
  process.exit(1);
});
