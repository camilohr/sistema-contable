import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-db.js";

function run(args: string[]): void {
  execSync(`npx ${args.map((a) => `"${a}"`).join(" ")}`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: "inherit",
  });
}

export default function setup(): void {
  const db = new URL(testDatabaseUrl()).pathname.slice(1);
  console.log(`\n[test-db] Preparando base de datos de tests: ${db}`);
  run(["prisma", "migrate", "deploy"]);
  run(["tsx", "prisma/seed.ts"]);
  console.log("[test-db] Base de tests lista.\n");
}
