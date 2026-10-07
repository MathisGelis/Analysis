// src/features/classement/calcul-classement.ts
//
// CALCUL DU CLASSEMENT d'un championnat, a partir des matchs joues. Fonctions pures (la lecture et l'ecriture en base sont
// dans le DerivationService et le ClassementService).
//
// - 3 points la victoire, 1 le nul, 0 la defaite. Seuls les matchs JOUES comptent (jamais un match programme, annule ou
//   reporte) et ceux d'un championnat : une coupe n'a pas de classement et ne doit pas gonfler celui d'une equipe.
// - Un classement par (saison, competition, poule) : les equipes d'un meme club (Seniors, U20...) ne se melangent pas.
// - Egalite de points : le DEPARTAGE FFF (reglement des championnats), dans l'ordre :
//     1. points dans les matchs joues entre les equipes a egalite (confrontations directes) ;
//     2. difference de buts dans ces confrontations ;
//     3. difference de buts generale ;
//     4. buts marques ; 5. buts marques a l'exterieur ; 6. buts encaisses a l'exterieur (le moins est le mieux).
//   Au-dela, le tirage au sort de la commission : ici l'ordre alphabetique des identifiants, stable d'un calcul a l'autre.
// - "Forme" : les 5 derniers resultats dans l'ordre des DATES (a defaut de date, de la journee), pas de la journee : un match
//   en retard est joue apres des matchs de journees suivantes.

import { estMatchJoue } from "@/features/matchs/match-joue";

export interface MatchClassable {
  clubDom: string; clubExt: string;
  equipeDomId?: string | null; equipeExtId?: string | null;
  saisonId?: string | null;
  journee?: string | null; date?: string | null;
  competition?: string | null; poule?: string | null;
  scoreDom?: number | null; scoreExt?: number | null;
  statut?: string | null;
}

export interface EquipeClassable { id: string; competitionLibelle?: string | null; poule?: string | null }

export interface LigneCalculee {
  clubId: string; equipeId: string | null; saisonId: string | null;
  rang: number; joues: number; v: number; n: number; d: number; bp: number; bc: number; pts: number;
  forme: string[];
}

/** Une coupe n'a pas de classement. */
export const estCompetitionSansClassement = (competition: string | null | undefined): boolean => /\bcoupe\b/i.test(competition ?? "");

/** "30/05/2026" ou "2026-05-30" (heure ignoree) -> jour en ms UTC ; null si illisible. */
export function jourDuMatch(date: string | null | undefined): number | null {
  const t = (date ?? "").trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const fr = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  return fr ? Date.UTC(+fr[3], +fr[2] - 1, +fr[1]) : null;
}

interface Cumul {
  clubId: string; equipeId: string | null; saisonId: string | null; cle: string; groupe: string;
  v: number; n: number; d: number; bp: number; bc: number; bpExt: number; bcExt: number;
  resultats: { jour: number; journee: number; ordre: number; issue: "V" | "N" | "D" }[];
}

const numeroJournee = (j: string | null | undefined) => parseInt((j ?? "").replace(/[^0-9]/g, ""), 10) || 0;
const pts = (c: { v: number; n: number }) => c.v * 3 + c.n;

export function calculerClassement(matchs: readonly MatchClassable[], equipes: readonly EquipeClassable[]): LigneCalculee[] {
  const equipeParId = new Map(equipes.map((e) => [e.id, e]));
  const cumuls = new Map<string, Cumul>();
  // Les confrontations directes de chaque championnat : "idA|idB" -> [(scoreA, scoreB)...] (cles de cumul).
  const confrontations = new Map<string, { a: string; b: string; sa: number; sb: number }[]>();

  const cumul = (clubId: string, equipeId: string | null, saisonId: string | null, m: MatchClassable): Cumul => {
    const eq = equipeId ? equipeParId.get(equipeId) : undefined;
    const cle = `${saisonId ?? ""}|${equipeId ?? clubId}`;
    let c = cumuls.get(cle);
    if (!c) {
      const competition = eq?.competitionLibelle ?? m.competition ?? "";
      const poule = eq?.poule ?? m.poule ?? "";
      c = { clubId, equipeId, saisonId, cle, groupe: `${saisonId ?? ""}|${competition}|${poule}`,
        v: 0, n: 0, d: 0, bp: 0, bc: 0, bpExt: 0, bcExt: 0, resultats: [] };
      cumuls.set(cle, c);
    }
    return c;
  };

  let ordre = 0;
  for (const m of matchs) {
    if (!estMatchJoue(m) || !Number.isFinite(m.scoreDom) || !Number.isFinite(m.scoreExt)) continue;
    const eqDom = m.equipeDomId ? equipeParId.get(m.equipeDomId) : undefined;
    if (estCompetitionSansClassement(m.competition) || estCompetitionSansClassement(eqDom?.competitionLibelle)) continue;
    const sd = m.scoreDom as number, se = m.scoreExt as number;
    const dom = cumul(m.clubDom, m.equipeDomId ?? null, m.saisonId ?? null, m);
    const ext = cumul(m.clubExt, m.equipeExtId ?? null, m.saisonId ?? null, m);
    dom.bp += sd; dom.bc += se; ext.bp += se; ext.bc += sd;
    ext.bpExt += se; ext.bcExt += sd;
    const issueDom = sd > se ? "V" : sd < se ? "D" : "N";
    const issueExt = sd > se ? "D" : sd < se ? "V" : "N";
    dom[issueDom === "V" ? "v" : issueDom === "D" ? "d" : "n"]++;
    ext[issueExt === "V" ? "v" : issueExt === "D" ? "d" : "n"]++;
    const jour = jourDuMatch(m.date) ?? 0, journee = numeroJournee(m.journee);
    dom.resultats.push({ jour, journee, ordre, issue: issueDom });
    ext.resultats.push({ jour, journee, ordre, issue: issueExt });
    ordre++;
    if (dom.groupe === ext.groupe) {
      (confrontations.get(dom.groupe) ?? confrontations.set(dom.groupe, []).get(dom.groupe)!).push({ a: dom.cle, b: ext.cle, sa: sd, sb: se });
    }
  }

  const groupes = new Map<string, Cumul[]>();
  for (const c of cumuls.values()) (groupes.get(c.groupe) ?? groupes.set(c.groupe, []).get(c.groupe)!).push(c);

  const lignes: LigneCalculee[] = [];
  for (const [groupe, equipesDuGroupe] of groupes) {
    const matchsDuGroupe = confrontations.get(groupe) ?? [];
    const ordonnees = departager(equipesDuGroupe, matchsDuGroupe);
    ordonnees.forEach((c, i) => lignes.push({
      clubId: c.clubId, equipeId: c.equipeId, saisonId: c.saisonId, rang: i + 1,
      joues: c.v + c.n + c.d, v: c.v, n: c.n, d: c.d, bp: c.bp, bc: c.bc, pts: pts(c),
      forme: [...c.resultats].sort((x, y) => x.jour - y.jour || x.journee - y.journee || x.ordre - y.ordre).slice(-5).map((r) => r.issue),
    }));
  }
  return lignes;
}

/** Classe un championnat : points, puis, a egalite, les criteres FFF (voir l'en-tete). */
function departager(equipes: Cumul[], matchs: { a: string; b: string; sa: number; sb: number }[]): Cumul[] {
  const parPoints = new Map<number, Cumul[]>();
  for (const c of equipes) (parPoints.get(pts(c)) ?? parPoints.set(pts(c), []).get(pts(c))!).push(c);
  const resultat: Cumul[] = [];
  for (const p of [...parPoints.keys()].sort((x, y) => y - x)) {
    const ex = parPoints.get(p)!;
    if (ex.length === 1) { resultat.push(ex[0]); continue; }
    const cles = new Set(ex.map((c) => c.cle));
    // Mini-championnat entre les ex-aequo : points et difference de buts de leurs seuls matchs.
    const mini = new Map(ex.map((c) => [c.cle, { pts: 0, diff: 0 }]));
    for (const m of matchs) {
      if (!cles.has(m.a) || !cles.has(m.b)) continue;
      const a = mini.get(m.a)!, b = mini.get(m.b)!;
      a.diff += m.sa - m.sb; b.diff += m.sb - m.sa;
      if (m.sa > m.sb) a.pts += 3; else if (m.sa < m.sb) b.pts += 3; else { a.pts++; b.pts++; }
    }
    resultat.push(...[...ex].sort((x, y) =>
      mini.get(y.cle)!.pts - mini.get(x.cle)!.pts
      || mini.get(y.cle)!.diff - mini.get(x.cle)!.diff
      || (y.bp - y.bc) - (x.bp - x.bc)
      || y.bp - x.bp
      || y.bpExt - x.bpExt
      || x.bcExt - y.bcExt
      || x.cle.localeCompare(y.cle)));
  }
  return resultat;
}
