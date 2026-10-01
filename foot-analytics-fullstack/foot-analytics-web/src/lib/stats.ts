// src/lib/stats.ts
// Calculs et derivations statistiques cote client.
// Formules pures, testees ; le serveur (foot-analytics-api) calcule les memes bilans a la volee.

import {
  ALL_MATCHS,
  CLASSEMENT_POULE_C,
  CLUB_PROPRE_ID,
  CLUBS,
  EQUIPES,
  JOUEURS,
  MATCHS_CHAPONNAY,
  RESULTATS_CHAPONNAY,
  RAPPORT_NEUVILLE,
} from "@/data/demo";
import type { Issue, Joueur, Match } from "@/lib/types";

/** Issue d'un match du point de vue d'un club. */
export function issuePourClub(m: Match, clubId: string): Issue {
  const ab = m.clubDom === clubId;
  const bp = ab ? m.scoreDom : m.scoreExt;
  const bc = ab ? m.scoreExt : m.scoreDom;
  return bp > bc ? "V" : bp === bc ? "N" : "D";
}

/** Bilan saison d'un club (V / N / D, buts, points, forme). */
export function bilanClub(clubId: string) {
  const matchs = ALL_MATCHS.filter(
    (m) => m.clubDom === clubId || m.clubExt === clubId,
  );
  let v = 0, n = 0, d = 0, bp = 0, bc = 0;
  const forme: Issue[] = [];
  for (const m of matchs) {
    const ab = m.clubDom === clubId;
    const _bp = ab ? m.scoreDom : m.scoreExt;
    const _bc = ab ? m.scoreExt : m.scoreDom;
    bp += _bp; bc += _bc;
    const r = issuePourClub(m, clubId);
    forme.push(r);
    if (r === "V") v++; else if (r === "N") n++; else d++;
  }
  return {
    joues: matchs.length,
    v, n, d,
    bp, bc, diff: bp - bc,
    pts: v * 3 + n,
    forme: forme.slice(-5),
    bpMoy: matchs.length ? +(bp / matchs.length).toFixed(2) : 0,
    bcMoy: matchs.length ? +(bc / matchs.length).toFixed(2) : 0,
  };
}

/**
 * Donnees pour la courbe "Buts marques / encaisses par journee" — basees sur
 * les vrais resultats Chaponnay extraits du fichier Excel.
 */
export function courbeButsChaponnay() {
  return RESULTATS_CHAPONNAY.map((r) => ({
    journee: r.journee,
    bm: r.butsMarques,
    bc: r.butsEncaisses,
    diff: r.butsMarques - r.butsEncaisses,
  }));
}

/** Top discipline (cartons) du club. */
export function topDiscipline(clubId: string, limit = 8): Joueur[] {
  return JOUEURS
    .filter((j) => j.clubId === clubId)
    .map((j) => ({ ...j, _disc: j.cartonsJaunes + j.cartonsRouges * 3 }))
    .sort((a, b) => (b as any)._disc - (a as any)._disc)
    .slice(0, limit);
}

/** Tops minutes / temps de jeu. */
export function topMinutes(clubId: string, limit = 10) {
  return JOUEURS
    .filter((j) => j.clubId === clubId)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

/** Joueurs les plus fatigues du club (donnees de demo). */
export function topFatigue(clubId: string, limit = 6) {
  return JOUEURS
    .filter((j) => j.clubId === clubId)
    .filter((j) => j.matchs >= 5)
    .sort((a, b) => (b.scoreFatigue ?? 0) - (a.scoreFatigue ?? 0))
    .slice(0, limit);
}

/** Onze probable (heuristique simple : meilleur effectif par poste). */
export function onzeProbable(clubId: string) {
  const grid: Record<string, Joueur[]> = {};
  for (const j of JOUEURS.filter((j) => j.clubId === clubId)) {
    const p = j.poste ?? "MIL";
    (grid[p] ||= []).push(j);
  }
  // A poste egal, le plus frais d'abord (a temps de jeu comparable, la fatigue departage).
  Object.values(grid).forEach((arr) =>
    arr.sort((a, b) => b.minutes - a.minutes || (a.scoreFatigue ?? 50) - (b.scoreFatigue ?? 50)),
  );
  const pick = (poste: string, n = 1) => (grid[poste] ?? []).slice(0, n);
  return [
    ...pick("GB", 1),
    ...pick("DD", 1),
    ...pick("DC", 2),
    ...pick("DG", 1),
    ...pick("MD", 2),
    ...pick("MO", 1),
    ...pick("AG", 1),
    ...pick("AT", 1),
    ...pick("MIL", 1),
  ].slice(0, 11);
}

export {
  ALL_MATCHS,
  CLASSEMENT_POULE_C,
  CLUB_PROPRE_ID,
  CLUBS,
  EQUIPES,
  JOUEURS,
  MATCHS_CHAPONNAY,
  RAPPORT_NEUVILLE,
  RESULTATS_CHAPONNAY,
};
