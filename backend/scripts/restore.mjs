#!/usr/bin/env node
// Restauración de un respaldo de base de datos.
//
// Uso:
//   node scripts/restore.mjs <archivo.dump>             # muestra qué haría (modo previsualización)
//   node scripts/restore.mjs <archivo.dump> --confirm   # restaura en la BD de DATABASE_URL
//   node scripts/restore.mjs <archivo.dump> --confirm --target <uri>  # restaura en otra BD
//   node scripts/restore.mjs <archivo.dump> --list      # solo lista el contenido del respaldo
//
// Formatos soportados: .dump (pg_restore, formato custom) y .sql (psql, texto plano).
//
// Variables de entorno opcionales:
//   PGRESTORE_PATH ruta explícita a pg_restore
//   PSQL_PATH      ruta explícita a psql

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { extraerZip } from "./zip-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(backendDir, ".env") });

const exec = promisify(execFile);
const existe = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

async function tool(nombre) {
  const envVar = process.env[`${nombre.toUpperCase()}_PATH`];
  if (envVar) return envVar;
  if (process.platform === "win32") {
    const base = process.env.ProgramFiles || "C:\\Program Files";
    try {
      const versiones = (await (await import("node:fs/promises")).readdir(path.join(base, "PostgreSQL"))).sort().reverse();
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

async function main() {
  const args = process.argv.slice(2);
  const archivoArg = args.find((a) => !a.startsWith("--"));
  const confirmar = args.includes("--confirm");
  const soloListar = args.includes("--list");
  const targetIdx = args.indexOf("--target");
  const target = targetIdx >= 0 ? args[targetIdx + 1] : null;

  if (!archivoArg) {
    console.error("Uso: node scripts/restore.mjs <archivo.dump|.sql> [--confirm] [--target <uri>] [--list]");
    process.exit(1);
  }

  const archivo = path.resolve(archivoArg);
  if (!(await existe(archivo))) {
    console.error(`ERROR: no existe el archivo ${archivo}`);
    process.exit(1);
  }

  const esSql = archivo.toLowerCase().endsWith(".sql");
  const esDump = archivo.toLowerCase().endsWith(".dump");
  if (!esSql && !esDump) {
    console.error("ERROR: el archivo debe tener extensión .dump o .sql");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL && !target) {
    console.error("ERROR: no se encontró DATABASE_URL en backend/.env ni se indicó --target.");
    process.exit(1);
  }

  const destino = (target || process.env.DATABASE_URL).split("?")[0];

  if (esDump) {
    const pgRestore = await tool("pg_restore");
    if (soloListar) {
      const { stdout } = await exec(pgRestore, ["--list", archivo]);
      console.log(stdout);
      return;
    }
    if (!confirmar) {
      console.log("Modo previsualización (no se restauró nada).");
      console.log("Objetos que contiene el respaldo (primeras líneas):");
      const { stdout } = await exec(pgRestore, ["--list", archivo]);
      console.log(stdout.split("\n").slice(0, 12).join("\n"));
      console.log(`\nPara restaurar de verdad ejecute con --confirm (destino: ${destino})`);
      return;
    }
    console.log(`Restaurando ${archivo} en ${destino} ...`);
    const argsRestore = ["--clean", "--if-exists", "--no-owner", "--no-privileges", "-d", destino, archivo];
    try {
      await exec(pgRestore, argsRestore, { encoding: "utf8" });
    } catch (err) {
      console.error("ERROR en la restauración:", err.stderr?.trim() || err.message);
      process.exit(1);
    }
  } else {
    const psql = await tool("psql");
    if (soloListar) {
      console.log("Los respaldos .sql no permiten previsualización; puede revisar el archivo directamente.");
      return;
    }
    if (!confirmar) {
      console.log("Modo previsualización (no se restauró nada).");
      console.log(`Para restaurar de verdad ejecute con --confirm (destino: ${destino})`);
      return;
    }
    console.log(`Restaurando ${archivo} en ${destino} ...`);
    try {
      await exec(psql, ["-v", "ON_ERROR_STOP=1", "-d", destino, "-f", archivo], { encoding: "utf8" });
    } catch (err) {
      console.error("ERROR en la restauración:", err.stderr?.trim() || err.message);
      process.exit(1);
    }
  }

  console.log("Restauración completada.");

  if (esDump && confirmar) {
    const adjuntosZip = archivo.replace(/\.dump$/i, ".adjuntos.zip");
    const adjuntosDir = process.env.ADJUNTOS_DIR ? path.resolve(process.env.ADJUNTOS_DIR) : path.join(backendDir, "adjuntos");
    if (await existe(adjuntosZip)) {
      try {
        await extraerZip(adjuntosZip, adjuntosDir);
        console.log(`Adjuntos restaurados en ${adjuntosDir}`);
      } catch (err) {
        console.error("ERROR al restaurar los adjuntos:", err.message);
      }
    } else {
      console.log("No se encontró un archivo de adjuntos asociado; se omiten los adjuntos.");
    }
  }
}

main().catch((err) => {
  console.error("ERROR inesperado:", err.message);
  process.exit(1);
});
