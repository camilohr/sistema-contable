#!/usr/bin/env node
// Restauración de un respaldo de base de datos.
//
// Uso:
//   node scripts/restore.mjs <archivo.dump>             # muestra qué haría (modo previsualización)
//   node scripts/restore.mjs <archivo.dump> --confirm   # restaura en la BD de DATABASE_URL
//   node scripts/restore.mjs <archivo.dump> --confirm --target <uri>  # restaura en otra BD
//   node scripts/restore.mjs <archivo.dump> --list      # solo lista el contenido del respaldo
//
// Formatos soportados: .dump (pg_restore, formato custom), .sql (psql, texto
// plano) y sus versiones cifradas .dump.enc / .sql.enc (si BACKUP_ENCRYPT_KEY
// está definida en backend/.env se descifran automáticamente a un temporal).
//
// Variables de entorno opcionales:
//   PGRESTORE_PATH ruta explícita a pg_restore
//   PSQL_PATH      ruta explícita a psql
//   BACKUP_ENCRYPT_KEY frase de acceso usada para cifrar los respaldos (S1-10);
//                      si el archivo está cifrado y no se define, se aborta.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { extraerZip } from "./zip-lite.mjs";
import { esCifrado, baseDeCifrado, descifrarArchivo } from "./cifrado.mjs";

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

  const esSql = baseDeCifrado(archivo).toLowerCase().endsWith(".sql");
  const esDump = baseDeCifrado(archivo).toLowerCase().endsWith(".dump");
  if (!esSql && !esDump) {
    console.error("ERROR: el archivo debe tener extensión .dump, .sql o sus versiones cifradas .enc");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL && !target) {
    console.error("ERROR: no se encontró DATABASE_URL en backend/.env ni se indicó --target.");
    process.exit(1);
  }

  const destino = (target || process.env.DATABASE_URL).split("?")[0];

  // S1-10: descifrar respaldo cifrado (.enc) a un archivo temporal antes de operar.
  let archivoPlano = archivo;
  let temporalCifrado = null;
  if (esCifrado(archivo)) {
    const clave = process.env.BACKUP_ENCRYPT_KEY;
    if (!clave) {
      console.error("ERROR: el respaldo está cifrado (S1-10) y no se encontró BACKUP_ENCRYPT_KEY en backend/.env para descifrarlo.");
      process.exit(1);
    }
    archivoPlano = path.join(os.tmpdir(), `contabilidad_restore_${Date.now()}.dump`);
    try {
      await descifrarArchivo(archivo, clave, archivoPlano);
      console.log(`Respaldo cifrado descifrado a temporal: ${archivoPlano}`);
    } catch (err) {
      await unlink(archivoPlano).catch(() => {});
      console.error("ERROR al descifrar el respaldo:", err.message);
      process.exit(1);
    }
    temporalCifrado = archivoPlano;
  }

  if (esDump) {
    const pgRestore = await tool("pg_restore");
    if (soloListar) {
      const { stdout } = await exec(pgRestore, ["--list", archivoPlano]);
      console.log(stdout);
      await unlink(temporalCifrado || "").catch(() => {});
      return;
    }
    if (!confirmar) {
      console.log("Modo previsualización (no se restauró nada).");
      console.log("Objetos que contiene el respaldo (primeras líneas):");
      const { stdout } = await exec(pgRestore, ["--list", archivoPlano]);
      console.log(stdout.split("\n").slice(0, 12).join("\n"));
      console.log(`\nPara restaurar de verdad ejecute con --confirm (destino: ${destino})`);
      await unlink(temporalCifrado || "").catch(() => {});
      return;
    }
    console.log(`Restaurando ${archivo} en ${destino} ...`);
    const argsRestore = ["--clean", "--if-exists", "--no-owner", "--no-privileges", "-d", destino, archivoPlano];
    try {
      await exec(pgRestore, argsRestore, { encoding: "utf8" });
    } catch (err) {
      await unlink(temporalCifrado || "").catch(() => {});
      console.error("ERROR en la restauración:", err.stderr?.trim() || err.message);
      process.exit(1);
    }
  } else {
    const psql = await tool("psql");
    if (soloListar) {
      console.log("Los respaldos .sql no permiten previsualización; puede revisar el archivo directamente.");
      await unlink(temporalCifrado || "").catch(() => {});
      return;
    }
    if (!confirmar) {
      console.log("Modo previsualización (no se restauró nada).");
      console.log(`Para restaurar de verdad ejecute con --confirm (destino: ${destino})`);
      await unlink(temporalCifrado || "").catch(() => {});
      return;
    }
    console.log(`Restaurando ${archivo} en ${destino} ...`);
    try {
      await exec(psql, ["-v", "ON_ERROR_STOP=1", "-d", destino, "-f", archivoPlano], { encoding: "utf8" });
    } catch (err) {
      await unlink(temporalCifrado || "").catch(() => {});
      console.error("ERROR en la restauración:", err.stderr?.trim() || err.message);
      process.exit(1);
    }
  }

  console.log("Restauración completada.");

  if (esDump && confirmar) {
    const adjuntosZip = baseDeCifrado(archivo).replace(/\.dump$/i, ".adjuntos.zip");
    const adjuntosZipEnc = esCifrado(archivo) ? `${adjuntosZip}.enc` : null;
    const adjuntosDir = process.env.ADJUNTOS_DIR ? path.resolve(process.env.ADJUNTOS_DIR) : path.join(backendDir, "adjuntos");
    const rutaAdj = adjuntosZipEnc && (await existe(adjuntosZipEnc)) ? adjuntosZipEnc : adjuntosZip;
    if (await existe(rutaAdj)) {
      let rutaZipPlano = rutaAdj;
      let temporalAdj = null;
      if (esCifrado(rutaAdj)) {
        const clave = process.env.BACKUP_ENCRYPT_KEY;
        if (!clave) {
          console.error("ERROR: los adjuntos están cifrados y no se encontró BACKUP_ENCRYPT_KEY.");
          await unlink(temporalCifrado || "").catch(() => {});
          process.exit(1);
        }
        rutaZipPlano = path.join(os.tmpdir(), `contabilidad_adjuntos_${Date.now()}.zip`);
        try {
          await descifrarArchivo(rutaAdj, clave, rutaZipPlano);
        } catch (err) {
          console.error("ERROR al descifrar los adjuntos:", err.message);
          await unlink(temporalCifrado || "").catch(() => {});
          process.exit(1);
        }
        temporalAdj = rutaZipPlano;
      }
      try {
        await extraerZip(rutaZipPlano, adjuntosDir);
        console.log(`Adjuntos restaurados en ${adjuntosDir}`);
      } catch (err) {
        console.error("ERROR al restaurar los adjuntos:", err.message);
      }
      await unlink(temporalAdj || "").catch(() => {});
    } else {
      console.log("No se encontró un archivo de adjuntos asociado; se omiten los adjuntos.");
    }
  }

  await unlink(temporalCifrado || "").catch(() => {});
}

main().catch((err) => {
  console.error("ERROR inesperado:", err.message);
  process.exit(1);
});
