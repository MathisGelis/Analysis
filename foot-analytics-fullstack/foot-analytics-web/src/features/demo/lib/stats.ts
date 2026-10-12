// src/features/demo/lib/stats.ts
//
// Calculs et derivations statistiques cote client.
// Formules pures, testees ; le serveur (foot-analytics-api) calcule les memes bilans a la volee.

import { ALL_MATCHS, RESULTATS_CHAPONNAY } from "@/shared/data/demo";
import type { Issue, Match } from "@/shared/lib/types";

/** Issue d'un match du point de vue d'un club. */
function issuePourClub(m: Match, clubId: string): Issue {
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
