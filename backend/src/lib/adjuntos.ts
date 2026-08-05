import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const adjuntosDir = process.env.ADJUNTOS_DIR ? path.resolve(process.env.ADJUNTOS_DIR) : path.join(backendDir, "adjuntos");

export async function garantizarCarpetaAdjuntos(): Promise<void> {
  await mkdir(adjuntosDir, { recursive: true });
}

export function hashContenido(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function nombreSeguro(nombreOriginal: string): { nombreArchivo: string; extension: string } {
  const ext = path.extname(nombreOriginal).toLowerCase().slice(0, 20);
  const nombreArchivo = `${randomUUID()}${ext}`;
  return { nombreArchivo, extension: ext };
}

export async function guardarArchivoAdjunto(buffer: Buffer, nombreArchivo: string): Promise<string> {
  await garantizarCarpetaAdjuntos();
  const ruta = path.join(adjuntosDir, nombreArchivo);
  await writeFile(ruta, buffer);
  return ruta;
}

export async function eliminarArchivoAdjunto(nombreArchivo: string): Promise<void> {
  const ruta = path.join(adjuntosDir, path.basename(nombreArchivo));
  await unlink(ruta).catch(() => {});
}
