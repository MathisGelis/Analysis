// Tests de bout en bout (Playwright). Ils demarrent LEUR PROPRE API et LEUR
// PROPRE front, sur des ports et une base SQLite temporaires : la base de
// developpement n'est jamais touchee.
//
//   npm run test:e2e            (Chromium : `npx playwright install chromium` la 1re fois)
//
// Variables utiles :
//   PYTHON_BIN            interpreteur Python avec pdfplumber (parcours d'import FMI ;
//                         le parcours est ignore si pdfplumber est introuvable)
//   PW_CHROMIUM_PATH      chemin d'un Chromium deja installe (evite le telechargement)
//   E2E_REUSE_SERVERS=1   reutilise des serveurs deja lances sur 4100 / 3100
//   E2E_DATABASE_URL      URL d'une base Postgres DEDIEE aux tests (nom contenant "test" ou "e2e") : l'API de
//                         test tourne dessus au lieu de SQLite ; son schema "public" est recree a chaque lancement

import { defineConfig } from "@playwright/test";
import path from "node:path";

export const API_PORT = 4100;
export const WEB_PORT = 3100;
export const API_URL = `http://localhost:${API_PORT}/api`;
const API_DIR = path.resolve(__dirname, "../foot-analytics-api");

export default defineConfig({
  testDir: "./e2e",
  // Les parcours partagent une base : execution sequentielle, dans l'ordre.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: [
    {
      // Recree la base, compile puis lance l'API (voir e2e/start-api.mjs).
      command: "node e2e/start-api.mjs",
      url: `${API_URL}/auth/me`,
      // 401 = l'API repond : c'est suffisant pour savoir qu'elle est prete.
      ignoreHTTPSErrors: true,
      reuseExistingServer: !!process.env.E2E_REUSE_SERVERS,
      timeout: 180_000,
      env: { API_DIR, PORT: String(API_PORT) },
    },
    {
      command: `npx next build && npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: !!process.env.E2E_REUSE_SERVERS,
      timeout: 300_000,
      // NEXT_PUBLIC_* est fige a la compilation : le build doit deja viser l'API de test.
      // Dossier de build dedie : ne pas ecraser le .next d'un `npm run dev` en cours.
      env: { NEXT_PUBLIC_API_URL: API_URL, NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
