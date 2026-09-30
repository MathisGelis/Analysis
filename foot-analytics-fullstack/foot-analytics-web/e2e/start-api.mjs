// Demarre l'API de test : base SQLite vierge, sans seed de demo, port dedie.
// Portable (pas de rm / && shell) pour fonctionner aussi sous Windows.

import { execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = process.env.API_DIR ?? path.resolve(here, "../../foot-analytics-api");
const tmp = path.join(here, ".tmp");
const db = path.join(tmp, "e2e.sqlite");

mkdirSync(tmp, { recursive: true });
rmSync(db, { force: true });

execSync("npm run build", { cwd: apiDir, stdio: "inherit" });

const api = spawn(process.execPath, ["dist/main.js"], {
  cwd: apiDir,
  stdio: "inherit",
  env: {
    ...process.env,
    SQLITE_PATH: db,
    AUTO_SEED: "false",
    CORS_ORIGIN: "http://localhost:3100",
    FMI_PARSER_PATH: process.env.FMI_PARSER_PATH ?? "parser/parse_fmi.py",
    LOG_LEVEL: "warn",
  },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => api.kill(sig));
api.on("exit", (code) => process.exit(code ?? 0));
