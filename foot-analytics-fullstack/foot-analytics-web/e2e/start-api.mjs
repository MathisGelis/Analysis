// Demarre l'API de test : base vierge, sans seed de demo, port dedie.
// Par defaut une base SQLite jetable ; avec E2E_DATABASE_URL (une URL Postgres), le meme parcours tourne sur
// Postgres : le schema "public" de cette base est entierement recree, donc elle doit etre dediee aux tests.
// Portable (pas de rm / && shell) pour fonctionner aussi sous Windows.

import { execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = process.env.API_DIR ?? path.resolve(here, "../../foot-analytics-api");
const tmp = path.join(here, ".tmp");
const db = path.join(tmp, "e2e.sqlite");

mkdirSync(tmp, { recursive: true });
rmSync(db, { force: true });

const urlPostgres = process.env.E2E_DATABASE_URL;
if (urlPostgres) await reinitialiserPostgres(urlPostgres);

execSync("npm run build", { cwd: apiDir, stdio: "inherit" });

const api = spawn(process.execPath, ["dist/main.js"], {
  cwd: apiDir,
  stdio: "inherit",
  env: {
    ...process.env,
    ...(urlPostgres ? { DB_TYPE: "postgres", DATABASE_URL: urlPostgres } : { SQLITE_PATH: db }),
    AUTO_SEED: "false",
    CORS_ORIGIN: "http://localhost:3100",
    FMI_PARSER_PATH: process.env.FMI_PARSER_PATH ?? "parser/parse_fmi.py",
    LOG_LEVEL: "warn",
  },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => api.kill(sig));
api.on("exit", (code) => process.exit(code ?? 0));

/** Repart d'un schema vide. Refuse tout ce qui ne ressemble pas a une base de test (jamais une base hebergee). */
async function reinitialiserPostgres(url) {
  const { hostname, pathname } = new URL(url);
  const base = pathname.replace(/^\//, "");
  if (/supabase\.(co|com)$/i.test(hostname) || !/(test|e2e)/i.test(base)) {
    throw new Error(`E2E_DATABASE_URL doit viser une base locale ou jetable dont le nom contient "test" ou "e2e" (recu : ${hostname}/${base}).`);
  }
  const { Client } = createRequire(path.join(apiDir, "package.json"))("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.end();
}
