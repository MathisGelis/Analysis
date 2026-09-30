// src/lib/matchs-equipe.ts
//
// Lecture des matchs du point de vue d'UNE equipe : resultats, bilan, matchs a
// venir. Fonctions pures. On raisonne par id d'equipe (equipeDomId /
// equipeExtId) et non par club : un club aligne plusieurs equipes (Seniors,
// U20...) dont les matchs ne doivent pas etre additionnes.

import type { Issue, Match } from "@/lib/types";

export interface ResultatMatch {
  matchId: string;
  journee: string;
  date: string;
  lieu: "Domicile" | "Exterieur";
  advClubId: string;
  butsMarques: number;
  butsEncaisses: number;
  issue: Issue;
}

export interface Bilan {
  joues: number;
  v: number;
  n: number;
  d: number;
  bp: number;
  bc: number;
  pts: number;
}

/** Date FMI "18/01/2026" ou ISO "2026-01-18" en timestamp local ; 0 si illisible. */
export function parseDateMatch(s?: string | null): number {
  if (!s) return 0;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  return 0;
}

type MatchEquipe = Pick<
  Match,
  "id" | "journee" | "date" | "clubDom" | "clubExt" | "equipeDomId" | "equipeExtId"
  | "scoreDom" | "scoreExt" | "statut"
>;

/**
 * Separe les matchs de l'equipe en resultats (joues, du plus ancien au plus
 * recent) et matchs a venir (du plus proche au plus lointain). Un match est
 * "a venir" quand il n'est pas marque joue ET que le score est 0-0.
 */
export function resultatsDeLEquipe(
  matchs: MatchEquipe[],
  equipeId: string,
): { joues: ResultatMatch[]; aVenir: MatchEquipe[] } {
  const joues: ResultatMatch[] = [];
  const aVenir: MatchEquipe[] = [];
  for (const m of matchs) {
    const dom = m.equipeDomId === equipeId;
    if (!dom && m.equipeExtId !== equipeId) continue;

    if (m.statut !== "joue" && (m.scoreDom ?? 0) + (m.scoreExt ?? 0) === 0) {
      aVenir.push(m);
      continue;
    }
    const bm = (dom ? m.scoreDom : m.scoreExt) ?? 0;
    const bc = (dom ? m.scoreExt : m.scoreDom) ?? 0;
    joues.push({
      matchId: m.id, journee: m.journee ?? "—", date: m.date ?? "",
      lieu: dom ? "Domicile" : "Exterieur",
      advClubId: dom ? m.clubExt : m.clubDom,
      butsMarques: bm, butsEncaisses: bc,
      issue: bm > bc ? "V" : bm === bc ? "N" : "D",
    });
  }
  joues.sort((a, b) => parseDateMatch(a.date) - parseDateMatch(b.date));
  aVenir.sort((a, b) => parseDateMatch(a.date) - parseDateMatch(b.date));
  return { joues, aVenir };
}

export function bilanDesResultats(joues: Pick<ResultatMatch, "butsMarques" | "butsEncaisses">[]): Bilan {
  let v = 0, n = 0, d = 0, bp = 0, bc = 0;
  for (const r of joues) {
    bp += r.butsMarques; bc += r.butsEncaisses;
    if (r.butsMarques > r.butsEncaisses) v++;
    else if (r.butsMarques === r.butsEncaisses) n++;
    else d++;
  }
  return { joues: joues.length, v, n, d, bp, bc, pts: 3 * v + n };
}
