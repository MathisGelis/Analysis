// src/features/analyse-jeu/lib/tirs-carte.ts
//
// La carte des tirs filtrable : un tir est cadre (but, arrete par le gardien), non cadre (a cote, contre, poteau ou barre, penalty rate)
// ou un but. Fonctions pures : on filtre la liste des tirs saisis, puis on en tire la carte du terrain (15 zones) et celle de la cage (6 zones).

import type { TirCarte } from "./jeu-types";

export type FiltreTirs = "tous" | "cadres" | "non_cadres" | "buts";

export const FILTRES_TIRS: { id: FiltreTirs; libelle: string }[] = [
  { id: "tous", libelle: "Tous" },
  { id: "cadres", libelle: "Cadrés" },
  { id: "non_cadres", libelle: "Non cadrés" },
  { id: "buts", libelle: "Buts" },
];

/** Cadre = but ou arrete par le gardien (« cadre » dans la saisie ; « arrete » pour un penalty) : la meme regle que les stats du match. */
export const estCadre = (t: Pick<TirCarte, "resultat">): boolean => t.resultat === "but" || t.resultat === "cadre" || t.resultat === "arrete";

export function filtrerTirs(tirs: readonly TirCarte[], filtre: FiltreTirs): TirCarte[] {
  switch (filtre) {
    case "cadres": return tirs.filter(estCadre);
    case "non_cadres": return tirs.filter((t) => !estCadre(t));
    case "buts": return tirs.filter((t) => t.resultat === "but");
    default: return [...tirs];
  }
}

/** Les 15 zones du terrain (tiers offensif d'abord, 5 couloirs de gauche a droite) : tirs et buts par zone, plus les tirs sans zone saisie. */
export function carteDesTirs(tirs: readonly TirCarte[]): { tirs: number[]; buts: number[]; sansZone: number } {
  const carte = { tirs: Array(15).fill(0) as number[], buts: Array(15).fill(0) as number[], sansZone: 0 };
  for (const t of tirs) {
    if (t.tier === null || t.couloir === null) { carte.sansZone++; continue; }
    const i = t.tier * 5 + t.couloir;
    carte.tirs[i]++;
    if (t.resultat === "but") carte.buts[i]++;
  }
  return carte;
}

export const NOMS_CAGE = ["haut gauche", "haut centre", "haut droit", "bas gauche", "bas centre", "bas droit"] as const;

/** Les 6 zones de la cage (haut puis bas, de gauche a droite) : seuls les tirs dont la zone du cadre est saisie ; les autres sont comptes a part. */
export function cageDesTirs(tirs: readonly TirCarte[]): { tirs: number[]; buts: number[]; sansZone: number } {
  const cage = { tirs: Array(6).fill(0) as number[], buts: Array(6).fill(0) as number[], sansZone: 0 };
  for (const t of tirs) {
    if (!estCadre(t) && t.resultat !== "poteau") continue;       // seul un tir qui atteint le cadre (ou le poteau) a une zone dans la cage
    if (t.cadre === null || t.cadre < 0 || t.cadre > 5) { cage.sansZone++; continue; }
    cage.tirs[t.cadre]++;
    if (t.resultat === "but") cage.buts[t.cadre]++;
  }
  return cage;
}

/** xG total d'une liste de tirs, a 2 decimales. */
export const xgDesTirs = (tirs: readonly TirCarte[]): number => +tirs.reduce((s, t) => s + (t.xg ?? 0), 0).toFixed(2);
