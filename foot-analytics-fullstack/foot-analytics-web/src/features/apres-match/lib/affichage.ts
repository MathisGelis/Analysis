// src/features/apres-match/lib/affichage.ts
//
// Les petits libelles de l'apres-match : faits d'un joueur, note a l'ecran, couleur de la note. Fonctions pures.

import type { Faits } from "./apres-types";

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

export function libelleFaits(f: Faits): string {
  const l: string[] = [];
  if (f.buts) l.push(pluriel(f.buts, "but", "buts"));
  if (f.passes) l.push(pluriel(f.passes, "passe décisive", "passes décisives"));
  if (f.arrets) l.push(pluriel(f.arrets, "arrêt", "arrêts"));
  if (f.tirs) l.push(pluriel(f.tirs, "tir", "tirs"));
  if (f.jaunes) l.push(pluriel(f.jaunes, "carton jaune", "cartons jaunes"));
  if (f.rouges) l.push(pluriel(f.rouges, "carton rouge", "cartons rouges"));
  return l.join(" · ") || "rien à signaler";
}

/** 7,5 : une décimale, virgule française. */
export const noteTexte = (n: number | null): string => (n === null ? "–" : n.toFixed(1).replace(".", ","));

/** Par demi-point, de 0 à 10. Sans note, on part de 6 : un appui sur − ou + donne 5,5 ou 6,5. */
export const noterPlus = (n: number | null, delta: 0.5 | -0.5): number => Math.min(10, Math.max(0, (n ?? 6) + delta));

export type TonNote = "haut" | "moyen" | "bas" | "vide";
export const tonNote = (n: number | null): TonNote => (n === null ? "vide" : n >= 7.5 ? "haut" : n >= 6.5 ? "moyen" : "bas");
