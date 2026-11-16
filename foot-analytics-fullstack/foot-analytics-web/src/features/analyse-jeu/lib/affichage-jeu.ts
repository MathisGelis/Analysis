// src/features/analyse-jeu/lib/affichage-jeu.ts
//
// Mise en forme du resume : parts de barres, intensite de la carte, phrase lue par les lecteurs d'ecran. Fonctions pures.

import type { ResumeMatch } from "./jeu-types";

/** Part de `a` dans le total a + b, en % (50 quand rien n'est compte : les deux barres egales plutot qu'un vide trompeur). */
export const partDe = (a: number, b: number): number => (a + b === 0 ? 50 : Math.round((a / (a + b)) * 100));

/** Intensite de 0 a 1 d'une zone : son nombre de tirs rapporte au maximum de la carte. */
export const intensite = (valeur: number, tirs: number[]): number => {
  const max = Math.max(0, ...tirs);
  return max === 0 ? 0 : valeur / max;
};

const pluriel = (n: number, un: string, plus: string) => `${n} ${n > 1 ? plus : un}`;

/** « 1 but pour nous et 0 pour eux de 0 à 15 minutes ; ... » : le graphique des buts en une phrase. */
export function phraseTranches(t: ResumeMatch["tranches"]): string {
  const l = t.filter((x) => x.nous + x.eux > 0).map((x) => `${x.nom} minutes : ${pluriel(x.nous, "but", "buts")} pour nous, ${x.eux} pour eux`);
  return l.length ? `Buts par tranche de 15 minutes. ${l.join(" ; ")}.` : "Aucun but dans le match.";
}

export const libelleScore = (s: { nous: number; eux: number }): string => `${s.nous} à ${s.eux}`;
