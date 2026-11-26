// src/features/analyse-jeu/data-hub.ts
//
// LE DATA HUB de mon equipe, a la maniere de celui de Football Manager : resultats, attaque, defense, coups de pied arretes,
// discipline, joueurs, forme. Tout est calcule des matchs saisis en direct (tirs, zones, xG estime, arrets, corners, fautes,
// cartons...) et de la feuille de match (score, cartons). Ce que l'app ne mesure pas (passes, duels, distance parcourue...) n'est pas la :
// rien n'est invente. Chaque bloc dit sur combien de matchs il porte. Fonctions pures.

import { estBut } from "../direct/stats-direct";
import { arretsDuMatch } from "./arrets";
import { filtrerMatchs, jeuEquipe, JoueurJeu, MatchJeu } from "./jeu-equipe";
import type { EvenementJeu } from "./stats-jeu";
import { xgDuTir, xgTotal } from "./xg";

const somme = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const moy = (total: number, n: number): number | null => (n > 0 ? +(total / n).toFixed(2) : null);
const estTir = (e: EvenementJeu) => e.type === "tir" || e.type === "coup_franc" || e.type === "penalty";
const nousDe = (m: MatchJeu) => (m.domicile ? "dom" : "ext") as "dom" | "ext";

/* ----------------------------------------------- un joueur ----------------------------------------------- */

export interface StatsJoueur {
  joueurId: string;
  /** Matchs saisis ou le joueur apparait (au moins un evenement a son nom). */
  matchs: number;
  buts: number; passes: number;
  /** Passes cles : passes qui precedent un tir qui n'est pas un but. */
  passesCles: number;
  tirs: number; cadres: number; xg: number;
  penaltys: { tires: number; marques: number };
  coupsFrancs: { tires: number; buts: number };
  corners: number;
  arrets: number;
  fautes: number; horsJeux: number; jaunes: number; rouges: number;
  entrees: number; sorties: number; blessures: number;
  /** Chaque tir du joueur, pour sa carte et la cage. */
  tirsDetail: { matchId: string; type: string; resultat: string; minute: number; tier: number | null; couloir: number | null; cadre: number | null; xg: number }[];
  parMatch: { matchId: string; date: string | null; adversaireId: string | null; domicile: boolean; bp: number; bc: number;
    buts: number; passes: number; tirs: number; cadres: number; xg: number; arrets: number; fautes: number; jaunes: number; rouges: number }[];
}

export function statsJoueur(matchs: MatchJeu[], joueurId: string): StatsJoueur {
  const s: StatsJoueur = {
    joueurId, matchs: 0, buts: 0, passes: 0, passesCles: 0, tirs: 0, cadres: 0, xg: 0, penaltys: { tires: 0, marques: 0 }, coupsFrancs: { tires: 0, buts: 0 },
    corners: 0, arrets: 0, fautes: 0, horsJeux: 0, jaunes: 0, rouges: 0, entrees: 0, sorties: 0, blessures: 0, tirsDetail: [], parMatch: [],
  };
  for (const m of filtrerMatchs(matchs, "tous", null)) {
    const nous = nousDe(m);
    const arretsM = arretsDuMatch(m).parGardien[joueurId] ?? 0;
    const ligne = { matchId: m.matchId, date: m.date, adversaireId: m.adversaireId, domicile: m.domicile, bp: m.bp, bc: m.bc, buts: 0, passes: 0, tirs: 0, cadres: 0, xg: 0, arrets: arretsM, fautes: 0, jaunes: 0, rouges: 0 };
    let present = arretsM > 0;
    for (const e of m.evenements) {
      if (e.cote !== nous) continue;
      if (e.joueurId === joueurId) {
        present = true;
        if (estTir(e) && e.resultat) {
          const xg = xgDuTir(e);
          s.tirs++; ligne.tirs++; s.xg += xg; ligne.xg += xg;
          const cadre = e.resultat === "but" || e.resultat === "cadre" || e.resultat === "arrete";
          if (cadre) { s.cadres++; ligne.cadres++; }
          if (estBut(e)) { s.buts++; ligne.buts++; }
          if (e.type === "penalty") { s.penaltys.tires++; if (estBut(e)) s.penaltys.marques++; }
          if (e.type === "coup_franc") { s.coupsFrancs.tires++; if (estBut(e)) s.coupsFrancs.buts++; }
          s.tirsDetail.push({ matchId: m.matchId, type: e.type, resultat: e.resultat, minute: e.minute, tier: e.zoneTier ?? null, couloir: e.zoneCouloir ?? null, cadre: e.zoneCadre ?? null, xg });
        } else if (e.type === "corner") s.corners++;
        else if (e.type === "faute") { s.fautes++; ligne.fautes++; }
        else if (e.type === "hors_jeu") s.horsJeux++;
        else if (e.type === "carton_jaune") { s.jaunes++; ligne.jaunes++; }
        else if (e.type === "carton_rouge") { s.rouges++; ligne.rouges++; }
        else if (e.type === "remplacement") s.sorties++;
        else if (e.type === "blessure") s.blessures++;
      }
      if (e.joueur2Id === joueurId) {
        present = true;
        if (e.type === "remplacement") s.entrees++;
        else if (estTir(e) && e.resultat) { if (estBut(e)) { s.passes++; ligne.passes++; } else s.passesCles++; }
      }
    }
    s.arrets += arretsM;
    if (present) { s.matchs++; s.parMatch.push(ligne); }
  }
  s.xg = +s.xg.toFixed(2);
  for (const l of s.parMatch) l.xg = +l.xg.toFixed(2);
  return s;
}

/* ----------------------------------------------- l'equipe ----------------------------------------------- */

interface PourContre { pour: number; contre: number }

export interface DataHub {
  couverture: { matchs: number; saisis: number };
  resultats: {
    joues: number; v: number; n: number; d: number; pts: number; ptsParMatch: number | null; bp: number; bc: number; diff: number;
    cleanSheets: number; sansMarquer: number;
    /** Les 5 derniers resultats, du plus ancien au plus recent. */
    forme: ("V" | "N" | "D")[];
  };
  attaque: null | {
    tirs: PourContre; cadres: PourContre; buts: PourContre; xg: PourContre;
    tirsParMatch: { pour: number | null; contre: number | null };
    cadresPct: { pour: number | null; contre: number | null };
    conversion: { pour: number | null; contre: number | null };
    /** Buts marques moins xG : positif = plus efficace que prevu. */
    butsMoinsXg: number;
    xgParTir: number | null;
    /** Grosses occasions : tirs de plus de 0,3 xG, et part transformee. */
    grossesOccasions: { pour: number; transformees: number; contre: number };
    tiersOffensif: { pour: number; contre: number };
  };
  defense: null | {
    butsEncaisses: number; tirsConcedes: number; cadresConcedes: number; xgConcede: number; butsEncaissesMoinsXg: number;
    arrets: number; arretsPct: number | null;
    cleanSheets: number;
  };
  coupsDePiedArretes: null | {
    corners: PourContre; coupsFrancs: PourContre; penaltys: PourContre;
    butsSurCpa: PourContre;
    /** Penaltys tires par mon equipe, et marques. */
    penaltysTires: { tires: number; marques: number };
  };
  discipline: null | { fautes: PourContre; horsJeux: PourContre; jaunes: PourContre; rouges: PourContre; fautesParMatch: number | null };
  /** Chaque tir saisi (les miens et ceux de l'adversaire), pour les cartes du terrain et de la cage. */
  tirs: { pour: TirHub[]; contre: TirHub[] };
  /** Buts par tranche de 15 minutes. */
  tranches: { pour: number[]; contre: number[]; matchsCouverts: number };
  contextes: { famille: string; tirs: number; buts: number }[];
  joueurs: (JoueurJeu & { xg: number; passesCles: number })[];
  /** Une ligne par match, du plus ancien au plus recent : la tendance. */
  parMatch: { matchId: string; date: string | null; adversaireId: string | null; domicile: boolean; bp: number; bc: number; saisi: boolean;
    tirs: number | null; tirsContre: number | null; xg: number | null; xgContre: number | null; arrets: number | null }[];
}

export interface TirHub { type: string; resultat: string; minute: number; tier: number | null; couloir: number | null; cadre: number | null; xg: number }

const versTirHub = (e: EvenementJeu): TirHub => ({ type: e.type, resultat: e.resultat as string, minute: e.minute, tier: e.zoneTier ?? null, couloir: e.zoneCouloir ?? null, cadre: e.zoneCadre ?? null, xg: xgDuTir(e) });
const GROSSE_OCCASION = 0.3;

export function dataHub(matchs: MatchJeu[]): DataHub {
  const ordre = filtrerMatchs(matchs, "tous", null);
  const saisis = ordre.filter((m) => m.evenements.length > 0);
  const jeu = jeuEquipe(ordre);

  // Resultats : tous les matchs joues.
  const issues = ordre.map((m) => (m.bp > m.bc ? "V" : m.bp === m.bc ? "N" : "D") as "V" | "N" | "D");
  const v = issues.filter((x) => x === "V").length, n = issues.filter((x) => x === "N").length, d = issues.filter((x) => x === "D").length;
  const resultats: DataHub["resultats"] = {
    joues: ordre.length, v, n, d, pts: v * 3 + n, ptsParMatch: moy(v * 3 + n, ordre.length),
    bp: somme(ordre.map((m) => m.bp)), bc: somme(ordre.map((m) => m.bc)), diff: somme(ordre.map((m) => m.bp - m.bc)),
    cleanSheets: ordre.filter((m) => m.bc === 0).length, sansMarquer: ordre.filter((m) => m.bp === 0).length,
    forme: issues.slice(-5),
  };

  const hub: DataHub = {
    couverture: { matchs: ordre.length, saisis: saisis.length },
    resultats, attaque: null, defense: null, coupsDePiedArretes: null, discipline: null,
    tirs: { pour: [], contre: [] },
    tranches: { pour: jeu.buts.pour, contre: jeu.buts.contre, matchsCouverts: jeu.buts.matchsCouverts },
    contextes: [], joueurs: [],
    parMatch: ordre.map((m) => ({ matchId: m.matchId, date: m.date, adversaireId: m.adversaireId, domicile: m.domicile, bp: m.bp, bc: m.bc, saisi: m.evenements.length > 0, tirs: null, tirsContre: null, xg: null, xgContre: null, arrets: null })),
  };
  if (saisis.length === 0) return hub;

  const pourDe = (m: MatchJeu) => m.evenements.filter((e) => e.cote === nousDe(m) && estTir(e) && !!e.resultat);
  const contreDe = (m: MatchJeu) => m.evenements.filter((e) => e.cote !== nousDe(m) && estTir(e) && !!e.resultat);
  const pour = saisis.flatMap(pourDe), contre = saisis.flatMap(contreDe);
  const cadre = (e: EvenementJeu) => e.resultat === "but" || e.resultat === "cadre" || e.resultat === "arrete";
  const butsPour = pour.filter(estBut).length, butsContre = contre.filter(estBut).length;
  const xgPour = xgTotal(pour), xgContre = xgTotal(contre);
  hub.tirs = { pour: pour.map(versTirHub), contre: contre.map(versTirHub) };

  const grosses = pour.filter((e) => xgDuTir(e) >= GROSSE_OCCASION);
  hub.attaque = {
    tirs: { pour: pour.length, contre: contre.length }, cadres: { pour: pour.filter(cadre).length, contre: contre.filter(cadre).length },
    buts: { pour: butsPour, contre: butsContre }, xg: { pour: xgPour, contre: xgContre },
    tirsParMatch: { pour: moy(pour.length, saisis.length), contre: moy(contre.length, saisis.length) },
    cadresPct: { pour: pct(pour.filter(cadre).length, pour.length), contre: pct(contre.filter(cadre).length, contre.length) },
    conversion: { pour: pct(butsPour, pour.length), contre: pct(butsContre, contre.length) },
    butsMoinsXg: +(butsPour - xgPour).toFixed(2),
    xgParTir: moy(xgPour, pour.length),
    grossesOccasions: { pour: grosses.length, transformees: grosses.filter(estBut).length, contre: contre.filter((e) => xgDuTir(e) >= GROSSE_OCCASION).length },
    tiersOffensif: { pour: pour.filter((e) => e.zoneTier === 0).length, contre: contre.filter((e) => e.zoneTier === 0).length },
  };

  const arrets = somme(saisis.map((m) => arretsDuMatch(m).total));
  const cadresConcedes = contre.filter(cadre).length;
  hub.defense = {
    butsEncaisses: butsContre, tirsConcedes: contre.length, cadresConcedes, xgConcede: xgContre, butsEncaissesMoinsXg: +(butsContre - xgContre).toFixed(2),
    arrets, arretsPct: pct(arrets, cadresConcedes), cleanSheets: saisis.filter((m) => m.bc === 0).length,
  };

  const compte = (type: string, cote: "pour" | "contre") => somme(saisis.map((m) => m.evenements.filter((e) => e.type === type && (e.cote === nousDe(m)) === (cote === "pour")).length));
  const paire = (type: string): PourContre => ({ pour: compte(type, "pour"), contre: compte(type, "contre") });
  const butCpa = (m: MatchJeu, nous: boolean) => m.evenements.filter((e) => (e.cote === nousDe(m)) === nous && estBut(e) && (e.type === "penalty" || e.type === "coup_franc" || (e.contextes ?? []).includes("CPA"))).length;
  const penaltys = pour.filter((e) => e.type === "penalty");
  hub.coupsDePiedArretes = {
    corners: paire("corner"), coupsFrancs: paire("coup_franc"), penaltys: paire("penalty"),
    butsSurCpa: { pour: somme(saisis.map((m) => butCpa(m, true))), contre: somme(saisis.map((m) => butCpa(m, false))) },
    penaltysTires: { tires: penaltys.length, marques: penaltys.filter(estBut).length },
  };
  const cartons = (type: string, cote: "pour" | "contre") => compte(type, cote);
  hub.discipline = {
    fautes: paire("faute"), horsJeux: paire("hors_jeu"),
    jaunes: { pour: cartons("carton_jaune", "pour"), contre: cartons("carton_jaune", "contre") },
    rouges: { pour: cartons("carton_rouge", "pour"), contre: cartons("carton_rouge", "contre") },
    fautesParMatch: moy(compte("faute", "pour"), saisis.length),
  };
  hub.contextes = (jeu.tirs?.familles ?? []).map((f) => ({ famille: f.famille, tirs: f.tirs, buts: f.buts }));

  // Les joueurs : buts, passes, tirs, xG, arrets...
  const parJoueur = new Map<string, JoueurJeu & { xg: number; passesCles: number }>();
  for (const j of jeu.joueurs) parJoueur.set(j.joueurId, { ...j, xg: 0, passesCles: 0 });
  for (const m of saisis) for (const e of m.evenements) {
    if (e.cote !== nousDe(m)) continue;
    if (e.joueurId && estTir(e) && e.resultat) { const x = parJoueur.get(e.joueurId); if (x) x.xg += xgDuTir(e); }
    if (e.joueur2Id && estTir(e) && e.resultat && !estBut(e)) { const x = parJoueur.get(e.joueur2Id); if (x) x.passesCles++; }
  }
  hub.joueurs = [...parJoueur.values()].map((x) => ({ ...x, xg: +x.xg.toFixed(2) }));

  hub.parMatch = ordre.map((m, i) => {
    const base = hub.parMatch[i];
    if (m.evenements.length === 0) return base;
    const p = pourDe(m), c = contreDe(m);
    return { ...base, tirs: p.length, tirsContre: c.length, xg: xgTotal(p), xgContre: xgTotal(c), arrets: arretsDuMatch(m).total };
  });
  return hub;
}

