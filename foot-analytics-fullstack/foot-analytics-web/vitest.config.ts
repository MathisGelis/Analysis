import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests unitaires (dossier tests/, miroir de src/) : fonctions pures, sans DOM ni Next.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
