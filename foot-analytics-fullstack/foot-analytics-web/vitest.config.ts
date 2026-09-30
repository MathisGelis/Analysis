import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests unitaires des fonctions pures de src/lib (sans DOM, sans Next).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
