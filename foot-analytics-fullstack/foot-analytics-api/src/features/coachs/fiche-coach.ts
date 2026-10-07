// src/features/coachs/fiche-coach.ts
//
// Fiche d'un entraineur (ou membre du staff) : bilan des matchs ou il etait sur le banc, par saison et
// par club, parcours de clubs, liste des matchs. Fonction pure, construite sur les participations
// `staff_matchs` (un coach, un match, un cote, ses fonctions sur la feuille).
//
// Comme les cumuls de derivation, elle ignore les participations sans fonction de banc (DR = delegue
// de rencontre) et les matchs non joues.

import { estMatchJoue } from "@/features/matchs/match-joue";
import { parseDateFlexible } from "@/common/dates";
import { SaisonRef } from "@/features/joueurs/parcours-joueur";

export const FONCTION_LIBELLE: Record<string, string> = {
  E: "Entraineur", A: "Adjoint", M: "Medecin", D: "Dirigeant",
};

/** "E/DR" -> ["E"] : fonctions de banc d'une feuille, sans le delegue de rencontre. */
export function fonctionsDeBanc(fonctions: string | null | undefined): string[] {
  return (fonctions ?? "").split("/").map((f) => f.trim().toUpperCase()).filter((f) => f && f !== "DR");
}

export interface MatchCoach {
  id: string;
  date: string | null;
  journee: string | null;
  competition?: string | null;
  poule?: string | null;
  saisonId: string | null;
  clubDom: string;
  clubExt: string;
  scoreDom: number;
  scoreExt: number;
  statut?: string | null;
}
export interface ParticipationCoach {
  cote: "dom" | "ext";
  fonctions: string;
  match: MatchCoach | null;
}

export interface BilanCoach {
  matchs: number; v: number; n: number; d: number;
  bp: number; bc: number; pts: number;
  /** Points par match ; 0 sans match. */
  ppm: number;
  /** Part de victoires, en % (entier). */
  pctV: number;
}
export interface MatchCoachLigne {
  matchId: string;
  date: string | null;
  journee: string | null;
  competition: string | null;
  saisonId: string | null;
  clubId: string;
  adversaireId: string;
  domicile: boolean;
  bp: number;
  bc: number;
  issue: "V" | "N" | "D";
  fonctions: string[];
}
export interface FicheCoach {
  /** Bilan sur la portee demandee (une saison, ou tout). */
  bilan: BilanCoach;
  fonctionPrincipale: string | null;
  fonctions: { code: string; libelle: string; matchs: number }[];
  /** Club de son match le plus recent. */
  clubActuelId: string | null;
  /** Une ligne par (saison, club), la plus recente d'abord ; toujours sur TOUTE la carriere. */
  parSaison: { saisonId: string | null; saisonNom: string | null; clubId: string; bilan: BilanCoach }[];
  /** Clubs ou il a officie, le plus recent d'abord. */
  parcours: { clubId: string; premierMatch: string | null; dernierMatch: string | null; matchs: number }[];
  /** Matchs de la portee demandee, du plus recent au plus ancien. */
  matchs: MatchCoachLigne[];
}

const VIDE = (): BilanCoach => ({ matchs: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, pts: 0, ppm: 0, pctV: 0 });

function ajouter(b: BilanCoach, l: Pick<MatchCoachLigne, "bp" | "bc" | "issue">) {
  b.matchs++; b.bp += l.bp; b.bc += l.bc;
  if (l.issue === "V") { b.v++; b.pts += 3; } else if (l.issue === "N") { b.n++; b.pts += 1; } else b.d++;
  b.ppm = +(b.pts / b.matchs).toFixed(2);
  b.pctV = Math.round((b.v / b.matchs) * 100);
}

/** Plus recent d'abord ; les dates illisibles ferment la marche. */
const parDateDesc = (a: { date: string | null }, b: { date: string | null }) =>
  (parseDateFlexible(b.date) ?? -Infinity) - (parseDateFlexible(a.date) ?? -Infinity);

export function ficheCoach(
  participations: ParticipationCoach[], saisons: Map<string, SaisonRef>, saisonId?: string | null,
): FicheCoach {
  const lignes: MatchCoachLigne[] = [];
  for (const p of participations) {
    const m = p.match;
    const fonctions = fonctionsDeBanc(p.fonctions);
    if (!m || fonctions.length === 0 || !estMatchJoue(m)) continue;
    const dom = p.cote === "dom";
    const bp = dom ? m.scoreDom : m.scoreExt;
    const bc = dom ? m.scoreExt : m.scoreDom;
    lignes.push({
      matchId: m.id, date: m.date ?? null, journee: m.journee ?? null, competition: m.competition ?? null,
      saisonId: m.saisonId ?? null, clubId: dom ? m.clubDom : m.clubExt, adversaireId: dom ? m.clubExt : m.clubDom,
      domicile: dom, bp, bc, issue: bp > bc ? "V" : bp < bc ? "D" : "N", fonctions,
    });
  }
  lignes.sort(parDateDesc);

  const dansPortee = saisonId === undefined || saisonId === null ? lignes : lignes.filter((l) => l.saisonId === saisonId);
  const bilan = VIDE();
  for (const l of dansPortee) ajouter(bilan, l);

  const parSaisonClub = new Map<string, FicheCoach["parSaison"][number]>();
  for (const l of lignes) {
    const cle = `${l.saisonId ?? ""}|${l.clubId}`;
    let e = parSaisonClub.get(cle);
    if (!e) {
      e = { saisonId: l.saisonId, saisonNom: l.saisonId ? saisons.get(l.saisonId)?.nom ?? null : null, clubId: l.clubId, bilan: VIDE() };
      parSaisonClub.set(cle, e);
    }
    ajouter(e.bilan, l);
  }
  const annee = (s: string | null) => (s ? saisons.get(s)?.anneeDebut ?? -Infinity : -Infinity);
  const parSaison = [...parSaisonClub.values()].sort((a, b) => annee(b.saisonId) - annee(a.saisonId));

  const clubs = new Map<string, FicheCoach["parcours"][number]>();
  for (const l of lignes) {           // du plus recent au plus ancien
    const c = clubs.get(l.clubId) ?? { clubId: l.clubId, premierMatch: null, dernierMatch: l.date, matchs: 0 };
    c.matchs++;
    c.premierMatch = l.date ?? c.premierMatch;
    clubs.set(l.clubId, c);
  }

  const compte = new Map<string, number>();
  for (const l of dansPortee) for (const f of l.fonctions) compte.set(f, (compte.get(f) ?? 0) + 1);
  const fonctions = [...compte].sort((a, b) => b[1] - a[1]).map(([code, matchs]) => ({ code, libelle: FONCTION_LIBELLE[code] ?? code, matchs }));

  return {
    bilan,
    fonctionPrincipale: fonctions[0]?.libelle ?? null,
    fonctions,
    clubActuelId: lignes[0]?.clubId ?? null,
    parSaison,
    parcours: [...clubs.values()],
    matchs: dansPortee,
  };
}
