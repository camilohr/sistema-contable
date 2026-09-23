// Cifrado AES-256-GCM para respaldos (S1-10: datos personales en reposo sin
// cifrado). Comparte la clave con backup.mjs / restore.mjs vía la variable de
// entorno BACKUP_ENCRYPT_KEY (frase de acceso). Formato en disco:
//
//   [magic "CBKENC1" (8)] [salt 16] [iv 12] [authTag 16] [ciphertext]
//
// La clave AES se deriva con scrypt desde la frase de acceso y un salt aleatorio
// que se guarda en la cabecera (cada archivo usa un salt distinto).

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const MAGIC = Buffer.from("CBKENC1", "utf8");
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function clave(passphrase, salt) {
  return scryptSync(passphrase, salt, 32);
}

export function esCifrado(nombre) {
  return String(nombre).toLowerCase().endsWith(".enc");
}

// Convierte "contabilidad_x.dump.enc" -> "contabilidad_x.dump" (base para retención)
export function baseDeCifrado(nombre) {
  return esCifrado(nombre) ? String(nombre).replace(/\.enc$/i, "") : String(nombre);
}

export async function cifrarArchivo(origen, destino, passphrase) {
  const datos = await readFile(origen);
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", clave(passphrase, salt), iv);
  const cifrado = Buffer.concat([cipher.update(datos), cipher.final()]);
  const tag = cipher.getAuthTag();
  await writeFile(destino, Buffer.concat([MAGIC, salt, iv, tag, cifrado]));
}

// Devuelve el contenido plano descifrado (en memoria; M8: sin archivo temporal).
export async function descifrarBuffer(origen, passphrase) {
  const buf = await readFile(origen);
  if (buf.length < MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error(`No es un respaldo cifrado válido: ${origen}`);
  }
  let off = MAGIC.length;
  const salt = buf.subarray(off, (off += SALT_LEN));
  const iv = buf.subarray(off, (off += IV_LEN));
  const tag = buf.subarray(off, (off += TAG_LEN));
  const decipher = createDecipheriv("aes-256-gcm", clave(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(off)), decipher.final()]);
}

export async function descifrarArchivo(origen, passphrase, destino) {
  const plano = await descifrarBuffer(origen, passphrase);
  await writeFile(destino, plano);
  return destino;
}
