#!/usr/bin/env node
// Respaldo de la base de datos con pg_dump (formato custom), verificación
// automática con pg_restore --list, informe por empresa (conteos por cliente con
// sus adjuntos, vía psql) y retención de copias.
//
// Uso:
//   node scripts/backup.mjs                       # crea un respaldo y aplica retención
//   node scripts/backup.mjs --keep 30             # conserva las 30 copias más recientes
//   node scripts/backup.mjs --dir C:\respaldos    # carpeta de destino
//   node scripts/backup.mjs --list                # lista respaldos y verifica su integridad
//
// Variables de entorno opcionales:
//   PGDUMP_PATH    ruta explícita a pg_dump
//   PGRESTORE_PATH ruta explícita a pg_restore

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { escribirZipDesdeCarpeta, extraerZip } from "./zip-lite.mjs";

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
  const opt = { keep: 14, dir: path.resolve(backendDir, "..", "backups"), list: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keep") opt.keep = Number(args[++i]);
    else if (args[i] === "--dir") opt.dir = path.resolve(args[++i]);
    else if (args[i] === "--list") opt.list = true;
  }
  return opt;
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

async function listar(opt, pgRestore) {
  await mkdir(opt.dir, { recursive: true });
  const archivos = (await readdir(opt.dir))
    .filter((f) => f.endsWith(".dump") || f.endsWith(".sql") || f.endsWith(".adjuntos.zip"))
    .sort();
  if (archivos.length === 0) {
    console.log("No hay respaldos en", opt.dir);
    return;
  }
  console.log(`Respaldos en ${opt.dir}:`);
  for (const f of archivos) {
    const ruta = path.join(opt.dir, f);
    const st = await stat(ruta);
    if (f.endsWith(".adjuntos.zip")) {
      const mb = (st.size / 1024 / 1024).toFixed(2);
      console.log(`  ${f.padEnd(32)} ${mb.padStart(8)} MB   adjuntos`);
      continue;
    }
    const estado = f.endsWith(".dump") ? await verificar(pgRestore, ruta) : { ok: null };
    const marca = estado.ok ? `OK (${estado.objetos} objetos)` : estado.ok === false ? "CORRUPTO" : "—";
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

  const dumps = (await readdir(opt.dir))
    .filter((f) => f.endsWith(".dump") && !f.includes(".tmp"))
    .sort()
    .reverse();
  const sobrantes = dumps.slice(opt.keep);
  for (const f of sobrantes) {
    await unlink(path.join(opt.dir, f));
    await unlink(path.join(opt.dir, f.replace(/\.dump$/, ".adjuntos.zip"))).catch(() => {});
    await registrar(logFile, `Eliminado por retención: ${f}`);
    console.log(`Retención: eliminado ${f}`);
  }

  await verificarPorEmpresa(pg, dbUri, logFile);

  const st = await stat(ruta);
  await registrar(
    logFile,
    `OK respaldo ${nombre} (${(st.size / 1024).toFixed(0)} KB, ${verif.objetos} objetos, retención ${opt.keep})`
  );
  console.log(`Listo. Quedan ${Math.min(dumps.length, opt.keep)} respaldo(s).`);
}

main().catch((err) => {
  console.error("ERROR inesperado:", err.message);
  process.exit(1);
});
