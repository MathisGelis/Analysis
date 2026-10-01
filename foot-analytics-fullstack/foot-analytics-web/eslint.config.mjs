// ESLint 9 (configuration "flat") : les regles de Next.js (core-web-vitals) reprises de eslint-config-next.
import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", ".next-e2e/**", "node_modules/**", "test-results/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Texte francais : l'apostrophe droite est partout dans le JSX, l'echapper nuit a la lecture.
      "react/no-unescaped-entities": "off",
    },
  },
];
