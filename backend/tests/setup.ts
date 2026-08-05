import { beforeEach, afterEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { vincularUsuarios } from "./helpers.js";

beforeEach(async () => {
  await vincularUsuarios();
});

afterEach(async () => {
  await prisma.usuarioEmpresa.deleteMany({});
});
