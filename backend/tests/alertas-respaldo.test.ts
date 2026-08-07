import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ultimoRespaldoExitoso } from "../src/lib/alertas.js";

async function logTemporal(contenido: string): Promise<{ dir: string; archivo: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "alertas-respaldo-"));
  const archivo = path.join(dir, "backup.log");
  await writeFile(archivo, contenido, "utf8");
  return { dir, archivo };
}

describe("ultimoRespaldoExitoso", () => {
  it("devuelve null si el archivo no existe", async () => {
    expect(await ultimoRespaldoExitoso(path.join(os.tmpdir(), "archivo-inexistente-2026.log"))).toBeNull();
  });

  it("devuelve null si no hay ninguna línea OK respaldo", async () => {
    const { dir, archivo } = await logTemporal(
      "2026-08-06T21:00:00.000Z  ERROR respaldo contabilidad_x.dump\n2026-08-07T07:00:00.000Z  OK por-empresa: 0 clientes\n"
    );
    try {
      expect(await ultimoRespaldoExitoso(archivo)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("devuelve el respaldo exitoso más reciente ignorando líneas previas", async () => {
    const { dir, archivo } = await logTemporal(
      "2026-08-05T08:00:00.000Z  ERROR respaldo contabilidad_20260805.dump: pattern match (0,0)\n" +
        "2026-08-06T09:30:00.000Z  OK respaldo contabilidad_20260806_093000.dump (100 KB, 350 objetos, retención 14)\n" +
        "2026-08-07T13:48:09.985Z  OK respaldo contabilidad_20260807_134809.dump (123 KB, 355 objetos, retención 14)\n"
    );
    try {
      const ultimo = await ultimoRespaldoExitoso(archivo);
      expect(ultimo).not.toBeNull();
      expect(ultimo!.toISOString()).toBe("2026-08-07T13:48:09.985Z");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("devuelve null si la fecha del OK no es parseable", async () => {
    const { dir, archivo } = await logTemporal("texto-raro  OK respaldo contabilidad_20260807.dump\n");
    try {
      expect(await ultimoRespaldoExitoso(archivo)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
