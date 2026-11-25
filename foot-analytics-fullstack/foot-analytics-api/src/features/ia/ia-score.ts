// src/features/ia/ia-score.ts
//
// LE SCORE : buts attendus de chaque equipe, appris sur les resultats passes (regression de Poisson, lien log).
//
// Le modele a regles (analyse/projection.ts) croise les moyennes de buts de la saison. Celui-ci part du MEME principe
// (ce que l'equipe marque, ce que l'autre encaisse, le terrain) mais en apprend les poids sur tous les matchs deja joues,
// avec des moyennes lissees vers la moyenne de la ligue (peu de matchs : on ne se fie pas a un 4-0), et la forme recente.
// Il remplace le modele a regles seulement s'il a fait mieux que lui, sur les memes matchs, pendant l'entrainement.
// Fonctions pures.

import type { Caracteristique, Poids } from "./ia-modele";

/** Un match deja joue par une equipe, vu de son cote. */
export interface MatchPasse { buts: number; butsContre: number; domicile: boolean }

/** Nombre de matchs recents pris en compte, et poids du lissage vers la moyenne de la ligue (en matchs "virtuels"). */
export const FENETRE_SCORE = 10;
const FENETRE_FORME = 3;
const LISSAGE = 3;
/** Sous ce nombre de matchs connus (de chaque equipe), le modele ne predit rien. */
export const MIN_MATCHS_SCORE = 3;
const MOYENNE_LIGUE_DEFAUT = 1.3;

export const CARACTERISTIQUES_SCORE: readonly Caracteristique[] = [
  { id: "biais", libelle: "Point de depart", aide: "Niveau de buts attendu avant tout indice." },
  { id: "domicile", libelle: "Avantage du terrain", aide: "Une equipe qui recoit marque plus ; en deplacement, moins." },
  { id: "attaque", libelle: "Ce que l'equipe marque (lisse)", aide: "Buts marques par match sur les derniers matchs, tires vers la moyenne de la ligue quand il y en a peu." },
  { id: "defenseAdverse", libelle: "Ce que l'adversaire encaisse (lisse)", aide: "Buts encaisses par match de l'adversaire, lisses de la meme facon." },
  { id: "formeAttaque", libelle: "Forme offensive recente", aide: "Ses 3 derniers matchs marquent plus ou moins que sa moyenne : la dynamique du moment." },
  { id: "formeDefense", libelle: "Forme defensive recente de l'adversaire", aide: "Les 3 derniers matchs de l'adversaire encaissent plus ou moins que sa moyenne." },
];

/** log(lambda) = 0,12 x terrain + 0,5 x log(attaque) + 0,5 x log(defense adverse) : la moyenne geometrique du modele a regles. */
export const W_SCORE_DEPART = [0, 0.12, 0.5, 0.5, 0, 0];

export interface PoidsScore extends Poids { moyenneLigue: number }

export function poidsScoreInitiaux(): PoidsScore {
  return { noms: CARACTERISTIQUES_SCORE.map((c) => c.id), w: [...W_SCORE_DEPART], moyenneLigue: MOYENNE_LIGUE_DEFAUT };
}

const lisse = (valeurs: readonly number[], n: number, moyenneLigue: number): number => {
  const pris = valeurs.slice(0, n);
  return (pris.reduce((s, v) => s + v, 0) + LISSAGE * moyenneLigue) / (pris.length + LISSAGE);
};

/**
 * Les caracteristiques d'une equipe qui marque face a une defense. `equipe` et `adversaire` : leurs matchs passes, le plus
 * recent d'abord. null quand l'une des deux a trop peu de matchs. `domicile` : null = terrain inconnu.
 */
export function caracteristiquesScore(
  equipe: readonly MatchPasse[], adversaire: readonly MatchPasse[], domicile: boolean | null, moyenneLigue: number,
): number[] | null {
  if (equipe.length < MIN_MATCHS_SCORE || adversaire.length < MIN_MATCHS_SCORE) return null;
  const mu = Math.max(0.3, moyenneLigue);
  const marques = equipe.map((m) => m.buts);
  const encaisses = adversaire.map((m) => m.butsContre);
  const attaque = lisse(marques, FENETRE_SCORE, mu);
  const defense = lisse(encaisses, FENETRE_SCORE, mu);
  return [
    1,
    domicile === null ? 0 : domicile ? 1 : -1,
    Math.log(attaque),
    Math.log(defense),
    Math.log(lisse(marques, FENETRE_FORME, mu) / attaque),
    Math.log(lisse(encaisses, FENETRE_FORME, mu) / defense),
  ];
}

/** Plafond de l'exposant : le meme que celui de l'apprentissage (ia-maths). */
const Z_MAX = 4;

export function butsAttendus(w: readonly number[], x: readonly number[]): number {
  let z = 0;
  for (let i = 0; i < w.length; i++) z += w[i] * x[i];
  return Math.exp(Math.min(Z_MAX, z));
}

/**
 * Les buts attendus de mon equipe et de l'adversaire pour un match a venir, ou null si l'un des deux manque de matchs.
 * Les poids sont ranges dans l'ordre du catalogue (un poids absent vaut zero).
 */
export function attendusDuModele(
  poids: PoidsScore, moi: readonly MatchPasse[], adv: readonly MatchPasse[], domicileMoi: boolean | null,
): { moi: number; adv: number } | null {
  const xMoi = caracteristiquesScore(moi, adv, domicileMoi, poids.moyenneLigue);
  const xAdv = caracteristiquesScore(adv, moi, domicileMoi === null ? null : !domicileMoi, poids.moyenneLigue);
  if (!xMoi || !xAdv) return null;
  const w = CARACTERISTIQUES_SCORE.map((c) => { const i = poids.noms.indexOf(c.id); return i >= 0 ? poids.w[i] : 0; });
  return { moi: butsAttendus(w, xMoi), adv: butsAttendus(w, xAdv) };
}
