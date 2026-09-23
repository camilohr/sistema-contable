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
// plano) y sus versiones cifradas .dump.enc / .sql.enc. Los archivos cifrados
// (S1-10) se descifran en memoria y se envían por stdin a pg_restore/psql, sin
// escribir archivos temporales en claro (M8).
//
// Variables de entorno opcionales:
//   PGRESTORE_PATH ruta explícita a pg_restore
//   PSQL_PATH      ruta explícita a psql
//   BACKUP_ENCRYPT_KEY frase de acceso usada para cifrar los respaldos (S1-10);
//                      si el archivo está cifrado y no se define, se aborta.

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { extraerZip } from "./zip-lite.mjs";
import { esCifrado, baseDeCifrado, descifrarBuffer } from "./cifrado.mjs";

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

// M6: credenciales por variables de entorno, no en la línea de comandos.
function parseUrlPg(uri) {
  try {
    const u = new URL(String(uri).split("?")[0].replace(/\/$/, ""));
    if (!u.hostname || !u.pathname || !u.pathname.startsWith("/")) return null;
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      user: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      database: u.pathname.replace(/^\//, ""),
    };
  } catch {
    return null;
  }
}

function envPg(props) {
  const env = { ...process.env };
  if (props) {
    if (props.password !== undefined) env.PGPASSWORD = props.password;
    env.PGHOST = props.host;
    env.PGPORT = String(props.port);
    if (props.user !== undefined) env.PGUSER = props.user;
  }
  return env;
}

// M8: ejecuta una herramienta enviándole el contenido por stdin (sin temporales).
function ejecutarConEntrada(cmd, args, entrada, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], ...(opts || {}) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(stderr.trim() || `${cmd} terminó con código ${code}`), { stderr, code }));
    });
    child.stdin.end(entrada);
  });
}

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
  const props = parseUrlPg(destino);
  // M6: sin credenciales en la invocación; PGPASSWORD/PGHOST/PGPORT/PGUSER vía env.
  const connArgs = props ? ["-d", props.database] : [destino];
  const env = envPg(props);

  // S1-10/M8: descifrar en memoria y operar por stdin, sin archivos temporales.
  let plano = null;
  if (esCifrado(archivo)) {
    const clave = process.env.BACKUP_ENCRYPT_KEY;
    if (!clave) {
      console.error("ERROR: el respaldo está cifrado (S1-10) y no se encontró BACKUP_ENCRYPT_KEY en backend/.env para descifrarlo.");
      process.exit(1);
    }
    try {
      plano = await descifrarBuffer(archivo, clave);
      console.log("Respaldo cifrado descifrado en memoria (sin temporales).");
    } catch (err) {
      console.error("ERROR al descifrar el respaldo:", err.message);
      process.exit(1);
    }
  }

  if (esDump) {
    const pgRestore = await tool("pg_restore");
    if (soloListar) {
      const { stdout } = plano
        ? await ejecutarConEntrada(pgRestore, ["--list", "-"], plano)
        : await exec(pgRestore, ["--list", archivo], { encoding: "utf8" });
      console.log(stdout);
      return;
    }
    if (!confirmar) {
      console.log("Modo previsualización (no se restauró nada).");
      console.log("Objetos que contiene el respaldo (primeras líneas):");
      const { stdout } = plano
        ? await ejecutarConEntrada(pgRestore, ["--list", "-"], plano)
        : await exec(pgRestore, ["--list", archivo], { encoding: "utf8" });
      console.log(stdout.split("\n").slice(0, 12).join("\n"));
      console.log(`\nPara restaurar de verdad ejecute con --confirm (destino: ${destino})`);
      return;
    }
    console.log(`Restaurando ${archivo} en ${destino} ...`);
    const argsRestore = ["--clean", "--if-exists", "--no-owner", "--no-privileges", ...connArgs];
    try {
      if (plano) {
        await ejecutarConEntrada(pgRestore, [...argsRestore, "-"], plano, { env });
      } else {
        await exec(pgRestore, [...argsRestore, archivo], { encoding: "utf8", env });
      }
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
      if (plano) {
        await ejecutarConEntrada(psql, ["-v", "ON_ERROR_STOP=1", ...connArgs, "-f", "-"], plano, { env });
      } else {
        await exec(psql, ["-v", "ON_ERROR_STOP=1", ...connArgs, "-f", archivo], { encoding: "utf8", env });
      }
    } catch (err) {
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
      try {
        let zipBuffer;
        if (esCifrado(rutaAdj)) {
          const clave = process.env.BACKUP_ENCRYPT_KEY;
          if (!clave) {
            console.error("ERROR: los adjuntos están cifrados y no se encontró BACKUP_ENCRYPT_KEY.");
            process.exit(1);
          }
          zipBuffer = await descifrarBuffer(rutaAdj, clave);
        } else {
          const { readFile } = await import("node:fs/promises");
          zipBuffer = await readFile(rutaAdj);
        }
        await extraerZip(zipBuffer, adjuntosDir);
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