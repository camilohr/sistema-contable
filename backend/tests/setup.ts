import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { vincularUsuarios } from "./helpers.js";

process.env.ADJUNTOS_DIR = path.join(os.tmpdir(), "contabilidad-test-adjuntos");

beforeEach(async () => {
  await vincularUsuarios();
});

afterEach(async () => {
  await prisma.usuarioEmpresa.deleteMany({});
});
