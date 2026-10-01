// src/features/matchs/lib/matchs-equipe.ts
//
// Lecture des matchs du point de vue d'UNE equipe : resultats, bilan, matchs a
// venir. Fonctions pures. On raisonne par id d'equipe (equipeDomId /
// equipeExtId) et non par club : un club aligne plusieurs equipes (Seniors,
// U20...) dont les matchs ne doivent pas etre additionnes.

import type { Issue, Match } from "@/shared/lib/types";

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
> & Partial<Pick<Match, "heure" | "competition" | "terrain">>;

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

/** Statuts d'un match qui ne se jouera pas a la date prevue : jamais "le prochain match". */
const STATUTS_SANS_ECHEANCE = ["annule", "reporte"];

/**
 * Le prochain match parmi ceux "a venir" d'une equipe : le plus proche A PARTIR D'AUJOURD'HUI. Un match passe
 * sans feuille importee n'est pas le prochain (il attend sa feuille : `aRenseigner`), ni un match annule ou
 * reporte. A defaut de match date a venir, un match sans date lisible (programme sans jour) sert de repli.
 */
export function prochainMatch<T extends { date?: string | null; statut?: string | null }>(
  aVenir: T[], aujourdhui: Date = new Date(),
): { prochain: T | null; aRenseigner: T[] } {
  const debutJour = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate()).getTime();
  const actifs = aVenir.filter((m) => !STATUTS_SANS_ECHEANCE.includes(m.statut ?? ""));
  const dates = actifs.map((m) => ({ m, t: parseDateMatch(m.date) }));
  const futurs = dates.filter((x) => x.t >= debutJour && x.t > 0).sort((a, b) => a.t - b.t).map((x) => x.m);
  const sansDate = dates.filter((x) => x.t === 0).map((x) => x.m);
  const aRenseigner = dates.filter((x) => x.t > 0 && x.t < debutJour).sort((a, b) => a.t - b.t).map((x) => x.m);
  return { prochain: futurs[0] ?? sansDate[0] ?? null, aRenseigner };
}

const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_LONGS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

/** "dimanche 18 octobre 2026" pour une date FMI ou ISO ; la date telle quelle si illisible, vide si absente. */
export function dateLongueFr(s?: string | null): string {
  const t = parseDateMatch(s);
  if (!t) return s ?? "";
  const d = new Date(t);
  return `${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}
