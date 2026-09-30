// src/lib/theme-server.ts
//
// Helpers theme cote SERVEUR. Pas de "use client" ici — ce fichier est
// importe par layout.tsx (Server Component) et ne doit pas etre bundle
// pour le navigateur.
//
// Le fichier theme-context.tsx (Client Component) reste pour le
// Provider et le hook useTheme(). Cette separation est obligatoire en
// Next App Router : on ne peut pas exporter une fonction utilisable
// cote serveur depuis un fichier marque "use client".

import { cookies } from "next/headers";

export type Theme = "dark" | "light";

const COOKIE_NAME = "fa_theme";
const STORAGE_KEY = "fa.theme";

/**
 * Lit le theme depuis le cookie pose par le client.
 * Retourne "dark" par defaut si aucun cookie (premier visit ou nettoyage).
 *
 * Utilise par layout.tsx pour poser data-theme="..." des le rendu SSR,
 * eliminant tout flash entre serveur et hydratation client.
 */
export function getServerTheme(): Theme {
  try {
    const v = cookies().get(COOKIE_NAME)?.value;
    return v === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/**
 * Script inline a placer dans <head> AVANT React. Lit localStorage ou
 * prefers-color-scheme et pose data-theme sur <html>. Anti-flash robuste.
 *
 * IMPORTANT : doit etre une chaine simple, executable telle quelle,
 * sans dependance. Pas de template literal avec variables qui font
 * reference a du runtime.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var t = localStorage.getItem("${STORAGE_KEY}");
    if (t !== "dark" && t !== "light") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;
