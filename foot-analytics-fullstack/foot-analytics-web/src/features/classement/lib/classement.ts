// src/features/classement/lib/classement.ts
//
// Lecture des lignes de classement. Fonctions pures.
//
// Le backend stocke UNE ligne par (equipe, saison) : sans filtre sur le
// championnat, "la ligne de mon club" designe n'importe laquelle de ses
// equipes (Seniors D2, U20 R2...) et le rang affiche est faux. Toute lecture
// passe donc par l'ensemble des equipes du championnat.

import { memeChampionnat } from "@/features/equipes/lib/empreinte-equipe";
import type { Equipe, LigneClassement } from "@/shared/lib/types";

/** Lignes des equipes du championnat, dans l'ordre du classement. */
export function lignesDuChampionnat(
  classement: LigneClassement[],
  equipesDuChampionnat: Set<string>,
): LigneClassement[] {
  return classement
    .filter((l) => !!l.equipeId && equipesDuChampionnat.has(l.equipeId))
    .sort((a, b) => a.rang - b.rang);
}

export function ligneDeLEquipe(
  lignes: LigneClassement[],
  equipeId: string | null | undefined,
): LigneClassement | null {
  return equipeId ? lignes.find((l) => l.equipeId === equipeId) ?? null : null;
}

/**
 * Les matchs du championnat : ceux dont les DEUX equipes en font partie (une equipe inconnue ne disqualifie pas un match dont
 * l'autre en est). Jamais "deux clubs du championnat" : les memes clubs se rencontrent aussi en U20, U15... dans d'autres
 * championnats, et ces matchs gonfleraient les statistiques de celui-ci.
 */
export function matchsDuChampionnat<M extends { equipeDomId?: string | null; equipeExtId?: string | null }>(
  matchs: readonly M[],
  equipesDuChampionnat: ReadonlySet<string>,
): M[] {
  return matchs.filter((m) => {
    const dom = m.equipeDomId ?? null, ext = m.equipeExtId ?? null;
    if (!dom && !ext) return false;
    return (!dom || equipesDuChampionnat.has(dom)) && (!ext || equipesDuChampionnat.has(ext));
  });
}

export const diffButs = (l: Pick<LigneClassement, "bp" | "bc">): number => l.bp - l.bc;

/**
 * Fenetre de `taille` lignes autour de l'equipe (mini-classement). Si
 * l'equipe n'a pas de ligne, on renvoie le haut du tableau.
 */
export function fenetreClassement(
  lignes: LigneClassement[],
  equipeId: string | null | undefined,
  taille = 5,
): LigneClassement[] {
  const i = equipeId ? lignes.findIndex((l) => l.equipeId === equipeId) : -1;
  if (i < 0 || lignes.length <= taille) return lignes.slice(0, taille);
  const avant = Math.floor((taille - 1) / 2);
  const debut = Math.min(Math.max(0, i - avant), lignes.length - taille);
  return lignes.slice(debut, debut + taille);
}

/**
 * Ligne de classement d'un CLUB (fiche club) sur une saison. Priorite a
 * l'equipe du club qui joue dans le meme championnat que `reference` (mon
 * equipe) ; a defaut, la meilleure equipe du club sur la saison.
 */
export function ligneDuClub(
  classement: LigneClassement[],
  equipes: Equipe[],
  clubId: string,
  saisonId: string | null,
  reference: Equipe | null = null,
): LigneClassement | null {
  const equipesClub = equipes.filter((e) =>
    e.clubId === clubId && (!saisonId || e.saisonId === saisonId));
  const ids = new Set(equipesClub.map((e) => e.id));
  const lignes = classement
    .filter((l) => !!l.equipeId && ids.has(l.equipeId))
    .sort((a, b) => a.rang - b.rang);
  if (lignes.length === 0) return null;

  if (reference) {
    const dansLeChampionnat = new Set(
      equipesClub.filter((e) => memeChampionnat(e, reference)).map((e) => e.id),
    );
    const l = lignes.find((x) => x.equipeId && dansLeChampionnat.has(x.equipeId));
    if (l) return l;
  }
  return lignes[0];
}
