// src/features/analyse/disposition-onze.ts
//
// OU SE PLACENT LES NUMEROS 1 A 11 dans un dispositif : "4-3-3" -> quatre defenseurs (2, 4, 5, 3), trois milieux
// (6, 8, 10), trois attaquants (7, 9, 11). Sert a dessiner le onze probable (rapport pre-match, page Predictions,
// export PPTX). Les numeros suivent la convention du staff (features/matchs/numeros-postes.ts) ; hors des dispositifs
// courants la disposition est approximative : un numero n'est pas un poste exact dans un 3-5-2 ou un 4-1-2-1-2.
// Fonctions pures.

import { formationValide } from "@/features/matchs/systeme";

/** Les lignes du defenseur a l'attaquant (sans le gardien) ; chaque ligne est ordonnee d'un cote du terrain a l'autre. */
export type Disposition = number[][];

const DISPOSITIONS: Readonly<Record<string, Disposition>> = {
  "4-4-2": [[2, 4, 5, 3], [7, 6, 8, 11], [9, 10]],
  "4-3-3": [[2, 4, 5, 3], [6, 8, 10], [7, 9, 11]],
  "4-2-3-1": [[2, 4, 5, 3], [6, 8], [7, 10, 11], [9]],
  "4-1-4-1": [[2, 4, 5, 3], [6], [7, 8, 10, 11], [9]],
  "4-5-1": [[2, 4, 5, 3], [7, 6, 8, 10, 11], [9]],
  "4-4-1-1": [[2, 4, 5, 3], [7, 6, 8, 11], [10], [9]],
  "3-5-2": [[4, 6, 5], [2, 7, 8, 11, 3], [9, 10]],
  "3-4-3": [[4, 6, 5], [2, 8, 10, 3], [7, 9, 11]],
  "5-3-2": [[2, 4, 6, 5, 3], [7, 8, 11], [9, 10]],
  "5-4-1": [[2, 4, 6, 5, 3], [7, 8, 10, 11], [9]],
};

const DEFENSES: Readonly<Record<number, number[]>> = {
  2: [4, 5], 3: [4, 6, 5], 4: [2, 4, 5, 3], 5: [2, 4, 6, 5, 3],
};

/** Du fond vers l'avant : l'ordre dans lequel les numeros qui restent remplissent les lignes d'un dispositif inhabituel. */
const PROFONDEUR = [2, 3, 6, 8, 10, 7, 11, 9];

/** Place d'un numero sur la largeur (0 = un cote, 1 = l'autre), pour ordonner une ligne. */
const LATERAL: Readonly<Record<number, number>> = { 2: 0, 7: 0.15, 4: 0.3, 10: 0.4, 6: 0.45, 9: 0.5, 8: 0.55, 5: 0.7, 11: 0.85, 3: 1 };

const PAR_DEFAUT = "4-4-2";

/** Disposition d'un dispositif ; un dispositif absent ou illisible donne celle du 4-4-2. */
export function dispositionDe(formation: string | null | undefined): Disposition {
  const f = (formation ?? "").replace(/\s+/g, "");
  if (!formationValide(f)) return DISPOSITIONS[PAR_DEFAUT].map((l) => [...l]);
  if (DISPOSITIONS[f]) return DISPOSITIONS[f].map((l) => [...l]);

  const tailles = f.split("-").map(Number);
  const defense = DEFENSES[tailles[0]];
  if (!defense) return DISPOSITIONS[PAR_DEFAUT].map((l) => [...l]);
  const reste = PROFONDEUR.filter((n) => !defense.includes(n));
  const lignes: Disposition = [[...defense]];
  for (const taille of tailles.slice(1)) {
    lignes.push(reste.splice(0, taille).sort((a, b) => LATERAL[a] - LATERAL[b]));
  }
  return lignes;
}

/** Le gardien puis les lignes : l'ordre des postes du composant Pitch (gardien d'abord, ligne par ligne). */
export function ordreTerrain(formation: string | null | undefined): number[] {
  return [1, ...dispositionDe(formation).flat()];
}

/** Un numero sur le terrain : sa ligne (0 = gardien), son rang dans la ligne et la taille de la ligne. */
export interface PlaceOnze { numero: number; ligne: number; rang: number; effectif: number }

export function placesDe(formation: string | null | undefined): PlaceOnze[] {
  return [
    { numero: 1, ligne: 0, rang: 0, effectif: 1 },
    ...dispositionDe(formation).flatMap((nums, i) => nums.map((numero, rang) => ({ numero, ligne: i + 1, rang, effectif: nums.length }))),
  ];
}
