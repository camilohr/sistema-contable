const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const envFile = path.join(root, "backend", ".env");

function loadEnv(file) {
  const vars = {};
  if (!fs.existsSync(file)) return vars;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[match[1]] = value;
  }
  return vars;
}

const url = (loadEnv(envFile).DATABASE_URL || process.env.DATABASE_URL || "").trim();

if (!url) {
  console.error("[postgres-mcp] No se encontro DATABASE_URL en backend/.env");
  process.exit(1);
}

function findNpxCli() {
  const candidates = [
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"),
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ];
  const pathDirs = (process.env.PATH || "").split(";");
  for (const dir of pathDirs) {
    if (!dir) continue;
    candidates.push(path.join(dir, "node_modules", "npm", "bin", "npx-cli.js"));
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const npxCli = findNpxCli();
if (!npxCli) {
  console.error("[postgres-mcp] No se pudo localizar npx-cli.js");
  process.exit(1);
}

// Arrancamos npx via node (no cmd.exe) para evitar problemas de escaping
// de la URL en Windows con child_process + .cmd.
const child = spawn(process.execPath, [npxCli, "-y", "@modelcontextprotocol/server-postgres", url], {
  stdio: "inherit",
  shell: false,
});

child.on("error", (err) => {
  console.error("[postgres-mcp] Error al iniciar:", err);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
