// src/features/analyse-jeu/lib/jeu-types.ts
//
// Ce que renvoie l'API des analyses du jeu (voir foot-analytics-api/src/features/analyse-jeu).

export interface LigneStat { cle: string; libelle: string; nous: number; eux: number }
export interface Constat { id: string; titre: string; detail: string; ton: "bon" | "alerte" | "neutre" }

export interface ResumeMatch {
  nousCote: "dom" | "ext";
  score: { nous: number; eux: number };
  sources: { detail: boolean; fmi: boolean };
  stats: LigneStat[];
  conversion: { nous: number | null; eux: number | null };
  tranches: { nom: string; nous: number; eux: number }[];
  butsSource: "direct" | "fmi" | "aucune";
  /** 15 zones, ligne par ligne : tiers offensif d'abord, puis median, puis defensif ; 5 couloirs de gauche a droite. */
  carte: { tirs: number[]; buts: number[] };
  contextes: { nom: string; tirs: number; buts: number }[];
  constats: Constat[];
}
