// src/features/analyse-jeu/xg.ts
//
// xG ESTIME d'un tir : la probabilite qu'il soit marque, d'apres ce que le staff saisit (la zone du terrain, le contexte, le type de
// tir). Ce n'est PAS le xG d'un fournisseur de donnees (pas de position exacte ni d'angle) : une estimation par zone, donnee comme
// telle partout ou elle s'affiche. Les valeurs sont celles, arrondies, que l'on observe en general selon l'emplacement du tir.
// Fonction pure.

import { COULOIRS } from "../direct/types";

/** xG de base par zone : [tiers offensif, median, defensif] x [gauche, axe gauche, centre, axe droit, droit]. */
const XG_ZONE: readonly (readonly number[])[] = [
  [0.05, 0.12, 0.18, 0.12, 0.05],
  [0.015, 0.03, 0.04, 0.03, 0.015],
  [0.005, 0.01, 0.015, 0.01, 0.005],
];
/** Quand la zone n'est pas saisie : la valeur moyenne d'un tir. */
const XG_SANS_ZONE = 0.09;
export const XG_PENALTY = 0.76;
const XG_COUP_FRANC = 0.06;

/** Les contextes qui changent la qualite d'une occasion (multiplicateurs, cumulables, le resultat reste borne). */
const FACTEURS_CONTEXTE: Record<string, number> = {
  "1 contre 1": 1.5,
  "Rebond": 1.2,
  "Contre-attaque": 1.15,
  "Jeu en profondeur": 1.2,
  "Relance du gardien": 1.1,
  "Frappe de loin": 0.6,
  "Centre": 0.85,
  "CPA": 0.9,
};

export interface TirPourXg {
  type: string;
  resultat?: string | null;
  zoneTier?: number | null;
  zoneCouloir?: number | null;
  contextes?: string[] | null;
}

/** Le xG estime d'un tir (0 a 1) ; 0 pour ce qui n'est pas un tir au but. Un tir contre (bloque) vaut moins : il n'a pas atteint le gardien. */
export function xgDuTir(t: TirPourXg): number {
  if (t.type === "penalty") return XG_PENALTY;
  if (t.type !== "tir" && t.type !== "coup_franc") return 0;
  let xg = t.type === "coup_franc" ? XG_COUP_FRANC
    : t.zoneTier != null && t.zoneCouloir != null && t.zoneTier >= 0 && t.zoneTier < XG_ZONE.length && t.zoneCouloir >= 0 && t.zoneCouloir < COULOIRS
      ? XG_ZONE[t.zoneTier][t.zoneCouloir] : XG_SANS_ZONE;
  for (const c of t.contextes ?? []) xg *= FACTEURS_CONTEXTE[c] ?? 1;
  if (t.resultat === "contre") xg *= 0.5;
  return Math.min(0.95, +xg.toFixed(4));
}

/** La somme des xG d'une liste de tirs, a 2 decimales. */
export const xgTotal = (tirs: readonly TirPourXg[]): number => +tirs.reduce((s, t) => s + xgDuTir(t), 0).toFixed(2);
