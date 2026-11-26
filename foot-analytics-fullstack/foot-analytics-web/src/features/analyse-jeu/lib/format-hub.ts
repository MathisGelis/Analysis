// src/features/analyse-jeu/lib/format-hub.ts
//
// Mise en forme du Data Hub et des stats d'un joueur : nombres, pourcentages, tri des joueurs. Fonctions pures.

import type { DataHubJoueur } from "./data-hub-types";

export const nb = (n: number | null | undefined, d = 0): string => (n === null || n === undefined ? "–" : n.toFixed(d).replace(".", ","));
export const pc = (n: number | null | undefined): string => (n === null || n === undefined ? "–" : `${n} %`);
/** « +1,2 » / « -0,4 » : un ecart signe (buts moins xG...). */
export const signe = (n: number): string => `${n > 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")}`;

export type CleTriJoueur = "nom" | "matchs" | "minutes" | "noteMoyenne" | "buts" | "passes" | "passesCles" | "tirs" | "cadres" | "xg" | "arrets" | "jaunes" | "rouges" | "scoreFatigue";

/** Du plus grand au plus petit (le nom : alphabetique) ; une valeur absente est toujours en fin de liste. */
export function trierJoueursHub(joueurs: readonly DataHubJoueur[], cle: CleTriJoueur, sens: "asc" | "desc"): DataHubJoueur[] {
  const dir = sens === "asc" ? 1 : -1;
  return [...joueurs].sort((a, b) => {
    const va = a[cle], vb = b[cle];
    if (va === null && vb === null) return a.nom.localeCompare(b.nom, "fr");
    if (va === null) return 1;
    if (vb === null) return -1;
    const ordre = typeof va === "string" || typeof vb === "string" ? String(va).localeCompare(String(vb), "fr") : (va as number) - (vb as number);
    return ordre !== 0 ? ordre * dir : a.nom.localeCompare(b.nom, "fr");
  });
}
