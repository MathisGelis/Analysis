// Mesure des tâches longues (Long Tasks API) et du LCP sur le build de production, avec un effectif de 157 joueurs
// REELLEMENT rattaches a l'equipe et une saison de matchs. Memes serveurs jetables que les e2e (base temporaire).
//
//   npm run perf:longtasks   (build + serveurs jetables, ~5 min)
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./perf",
  timeout: 300_000,
  globalSetup: "./e2e/global-setup.ts",
});
