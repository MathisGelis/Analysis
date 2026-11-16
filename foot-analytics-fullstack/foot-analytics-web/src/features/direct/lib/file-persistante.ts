// src/features/direct/lib/file-persistante.ts
//
// La file d'envoi du direct gardee sur l'appareil : si l'onglet se recharge, si le telephone se verrouille ou si le reseau tombe
// au milieu du match, les evenements saisis mais pas encore confirmes ne se perdent pas. Une file par match. Le stockage peut
// etre absent, plein ou refuse (navigation privee) : on ne plante jamais, on perd seulement la sauvegarde.

import type { Operation } from "./file-envoi";

const cle = (matchId: string) => `fa.direct.file.${matchId}`;

type Stockage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Une operation valide : un ajout avec un evenement identifiable, ou une suppression avec un identifiant. */
function estOperation(x: unknown): x is Operation {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.genre === "suppression") return typeof o.id === "string" && o.id.length > 0;
  if (o.genre === "ajout") {
    const e = o.evenement as Record<string, unknown> | undefined;
    return !!e && typeof e.id === "string" && typeof e.type === "string" && typeof e.cote === "string" && typeof e.minute === "number" && typeof e.periode === "number";
  }
  return false;
}

export function lireFile(stockage: Stockage | null | undefined, matchId: string): Operation[] {
  try {
    const brut = stockage?.getItem(cle(matchId));
    if (!brut) return [];
    const x = JSON.parse(brut);
    return Array.isArray(x) ? x.filter(estOperation) : [];
  } catch { return []; }
}

export function ecrireFile(stockage: Stockage | null | undefined, matchId: string, file: Operation[]): void {
  try {
    if (file.length === 0) stockage?.removeItem(cle(matchId));
    else stockage?.setItem(cle(matchId), JSON.stringify(file));
  } catch { /* stockage plein ou refuse : la file reste en memoire */ }
}

/** Le stockage du navigateur, ou null s'il est inaccessible. */
export function stockageLocal(): Stockage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
