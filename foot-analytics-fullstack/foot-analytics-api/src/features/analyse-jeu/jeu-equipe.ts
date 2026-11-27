// src/features/analyse-jeu/jeu-equipe.ts
//
// Le jeu d'une equipe sur plusieurs matchs : somme des resumes de match (voir stats-jeu.ts), avec ce qu'il faut pour ne jamais
// tromper le lecteur — chaque bloc dit sur combien de matchs il porte. Les matchs saisis en direct donnent tirs, zones, contextes,
// fautes... ; tous les matchs donnent score, cartons et buts dates quand la feuille de match les a. Fonctions pures.

import { parseDateFlexible } from "@/common/dates";
import type { SegmentSysteme } from "@/features/matchs/systeme";

import { estBut } from "../direct/stats-direct";
import { COULOIRS, TIERS } from "../direct/types";
import { arretsDuMatch } from "./arrets";
import { Cote, EvenementFmi, EvenementJeu, NOMS_TRANCHES, resumerMatch, ResumeMatch } from "./stats-jeu";

export type Lieu = "tous" | "domicile" | "exterieur";
export const NB_ZONES = TIERS * COULOIRS;

/** Un match joue, vu par l'equipe analysee. */
export interface MatchJeu {
  matchId: string; date: string | null; journee?: string | null;
  domicile: boolean; adversaireId: string | null; formation: string | null;
  bp: number; bc: number;
  evenements: EvenementJeu[]; fmi: EvenementFmi[];
  /** Le gardien de depart de l'equipe analysee (fiche joueur), quand l'avant-match le donne : sert a attribuer les arrets deduits des tirs. */
  gardien?: string | null;
  /** Le dispositif de l'equipe au fil du match (coup d'envoi puis changements saisis) : les stats par dispositif se repartissent au prorata. */
  segments?: SegmentSysteme[];
}

const nousCoteDe = (m: MatchJeu): Cote => (m.domicile ? "dom" : "ext");
const inverse = (c: Cote): Cote => (c === "dom" ? "ext" : "dom");

/** Les matchs retenus : le lieu, puis les N derniers (par date) parmi ceux-la ; chronologique en sortie. */
export function filtrerMatchs<T extends { domicile: boolean; date: string | null }>(matchs: T[], lieu: Lieu, derniers: number | null): T[] {
  const parLieu = matchs.filter((m) => lieu === "tous" || (lieu === "domicile") === m.domicile);
  const tries = [...parLieu].sort((a, b) => (parseDateFlexible(a.date) ?? 0) - (parseDateFlexible(b.date) ?? 0));
  return derniers && derniers > 0 ? tries.slice(-derniers) : tries;
}

/** Famille d'un contexte de tir : le jeu place, la transition (contre-attaque, recuperation haute), le coup de pied arrete. */
export type Famille = "Jeu placé" | "Transition" | "Coup de pied arrêté" | "Autre";
export function familleDe(contexte: string): Famille {
  const c = contexte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (c.includes("place")) return "Jeu placé";
  if (c.includes("rapide") || c.includes("recup") || c.includes("contre") || c.includes("transition")) return "Transition";
  if (c.includes("cpa") || c.includes("coup de pied") || c.includes("corner") || c.includes("penalty") || c.includes("coup franc")) return "Coup de pied arrêté";
  return "Autre";
}

export interface CarteZones { tirs: number[]; buts: number[] }
export interface TotalCote { tirs: number; cadres: number; buts: number }

export interface JeuEquipe {
  couverture: { matchs: number; saisis: number; butsDates: number; avecCartons: number };
  /** Buts par tranche de 15 minutes, sur les seuls matchs dont les buts sont dates (direct ou feuille de match). */
  buts: { pour: number[]; contre: number[]; matchsCouverts: number; total: { pour: number; contre: number } };
  /** Detail des tirs : null tant qu'aucun match n'est saisi. */
  tirs: null | {
    matchs: number;
    pour: TotalCote; contre: TotalCote;
    parMatch: { pour: number; contre: number };
    conversion: { pour: number | null; contre: number | null };
    cadresPct: { pour: number | null; contre: number | null };
    carte: { pour: CarteZones; contre: CarteZones };
    contextes: { nom: string; famille: Famille; tirs: number; buts: number }[];
    familles: { famille: Famille; tirs: number; buts: number }[];
  };
  discipline: null | {
    /** Matchs saisis : fautes, hors-jeux, corners, coups francs, penaltys, arrets. Tous les matchs : cartons. */
    matchsSaisis: number; matchsCartons: number;
    fautes: { pour: number; contre: number }; horsJeux: { pour: number; contre: number };
    corners: { pour: number; contre: number }; coupsFrancs: { pour: number; contre: number }; penaltys: { pour: number; contre: number };
    arrets: { pour: number; contre: number };
    jaunes: { pour: number; contre: number }; rouges: { pour: number; contre: number };
  };
  matchs: { matchId: string; date: string | null; domicile: boolean; adversaireId: string | null; bp: number; bc: number; saisi: boolean; segments?: SegmentSysteme[]; tirs: number | null; cadres: number | null; formation: string | null }[];
  joueurs: JoueurJeu[];
}

export interface JoueurJeu { joueurId: string; matchs: number; buts: number; passes: number; tirs: number; cadres: number; arrets: number; jaunes: number; rouges: number }

const somme = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const stat = (r: ResumeMatch, cle: string) => r.stats.find((s) => s.cle === cle);
const arrondi1 = (x: number) => Math.round(x * 10) / 10;

export function jeuEquipe(matchs: MatchJeu[]): JeuEquipe {
  const saisis = matchs.filter((m) => m.evenements.length > 0);
  const resumes = matchs.map((m) => ({
    m, r: resumerMatch({ nousCote: nousCoteDe(m), evenements: m.evenements, fmi: m.fmi, scoreDom: m.domicile ? m.bp : m.bc, scoreExt: m.domicile ? m.bc : m.bp }),
    contre: resumerMatch({ nousCote: inverse(nousCoteDe(m)), evenements: m.evenements, fmi: m.fmi, scoreDom: m.domicile ? m.bp : m.bc, scoreExt: m.domicile ? m.bc : m.bp }),
  }));

  // Buts par tranche : les matchs dont les buts sont dates.
  const pour = Array(6).fill(0) as number[], contre = Array(6).fill(0) as number[];
  let couverts = 0;
  for (const { r } of resumes) {
    if (r.butsSource === "aucune") continue;
    couverts++;
    r.tranches.forEach((t, i) => { pour[i] += t.nous; contre[i] += t.eux; });
  }

  const res: JeuEquipe = {
    couverture: { matchs: matchs.length, saisis: saisis.length, butsDates: couverts, avecCartons: resumes.filter(({ r }) => r.stats.some((s) => s.cle === "jaunes")).length },
    buts: { pour, contre, matchsCouverts: couverts, total: { pour: somme(pour), contre: somme(contre) } },
    tirs: null, discipline: null,
    matchs: matchs.map((m, i) => {
      const r = resumes[i].r;
      return { matchId: m.matchId, date: m.date, domicile: m.domicile, adversaireId: m.adversaireId, bp: m.bp, bc: m.bc, saisi: m.evenements.length > 0,
        tirs: stat(r, "tirs")?.nous ?? null, cadres: stat(r, "cadres")?.nous ?? null, formation: m.formation, segments: m.segments };
    }),
    joueurs: joueursDe(matchs),
  };

  if (saisis.length > 0) {
    const de = (cle: string, lot: typeof resumes) => ({ pour: somme(lot.map(({ r }) => stat(r, cle)?.nous ?? 0)), contre: somme(lot.map(({ r }) => stat(r, cle)?.eux ?? 0)) });
    const lot = resumes.filter(({ m }) => m.evenements.length > 0);
    const tirs = de("tirs", lot), cadres = de("cadres", lot);
    const butsPour = somme(lot.map(({ m, r }) => m.evenements.filter((e) => estBut(e) && e.cote === nousCoteDe(m)).length));
    const butsContre = somme(lot.map(({ m }) => m.evenements.filter((e) => estBut(e) && e.cote === inverse(nousCoteDe(m))).length));
    const carte = (sens: "r" | "contre"): CarteZones => {
      const c: CarteZones = { tirs: Array(NB_ZONES).fill(0), buts: Array(NB_ZONES).fill(0) };
      for (const x of lot) for (let i = 0; i < NB_ZONES; i++) { c.tirs[i] += x[sens].carte.tirs[i]; c.buts[i] += x[sens].carte.buts[i]; }
      return c;
    };
    const ctx = new Map<string, { tirs: number; buts: number }>();
    for (const { r } of lot) for (const c of r.contextes) { const l = ctx.get(c.nom) ?? { tirs: 0, buts: 0 }; l.tirs += c.tirs; l.buts += c.buts; ctx.set(c.nom, l); }
    const contextes = [...ctx].map(([nom, l]) => ({ nom, famille: familleDe(nom), ...l })).sort((a, b) => b.tirs - a.tirs);
    const fam = new Map<Famille, { tirs: number; buts: number }>();
    for (const c of contextes) { const l = fam.get(c.famille) ?? { tirs: 0, buts: 0 }; l.tirs += c.tirs; l.buts += c.buts; fam.set(c.famille, l); }
    res.tirs = {
      matchs: lot.length,
      pour: { tirs: tirs.pour, cadres: cadres.pour, buts: butsPour }, contre: { tirs: tirs.contre, cadres: cadres.contre, buts: butsContre },
      parMatch: { pour: arrondi1(tirs.pour / lot.length), contre: arrondi1(tirs.contre / lot.length) },
      conversion: { pour: pct(butsPour, tirs.pour), contre: pct(butsContre, tirs.contre) },
      cadresPct: { pour: pct(cadres.pour, tirs.pour), contre: pct(cadres.contre, tirs.contre) },
      carte: { pour: carte("r"), contre: carte("contre") },
      contextes, familles: [...fam].map(([famille, l]) => ({ famille, ...l })).sort((a, b) => b.tirs - a.tirs),
    };
    res.discipline = {
      matchsSaisis: lot.length,
      matchsCartons: res.couverture.avecCartons,
      fautes: de("fautes", lot), horsJeux: de("hors_jeux", lot), corners: de("corners", lot), coupsFrancs: de("coups_francs", lot),
      penaltys: de("penaltys", lot), arrets: de("arrets", lot),
      jaunes: de("jaunes", resumes), rouges: de("rouges", resumes),
    };
  } else if (res.couverture.avecCartons > 0) {
    const de = (cle: string) => ({ pour: somme(resumes.map(({ r }) => stat(r, cle)?.nous ?? 0)), contre: somme(resumes.map(({ r }) => stat(r, cle)?.eux ?? 0)) });
    const zero = { pour: 0, contre: 0 };
    res.discipline = { matchsSaisis: 0, matchsCartons: res.couverture.avecCartons, fautes: zero, horsJeux: zero, corners: zero, coupsFrancs: zero, penaltys: zero, arrets: zero, jaunes: de("jaunes"), rouges: de("rouges") };
  }
  return res;
}

/** Ce que chaque joueur a fait, d'apres les evenements saisis de mon equipe (par identifiant de fiche : un numero adverse n'en a pas). */
export function joueursDe(matchs: MatchJeu[]): JoueurJeu[] {
  const l = new Map<string, JoueurJeu & { vus: Set<string> }>();
  const j = (id: string) => l.get(id) ?? (l.set(id, { joueurId: id, matchs: 0, buts: 0, passes: 0, tirs: 0, cadres: 0, arrets: 0, jaunes: 0, rouges: 0, vus: new Set() }), l.get(id)!);
  for (const m of matchs) {
    for (const e of m.evenements) {
      if (e.cote !== nousCoteDe(m)) continue;
      const vu = (id: string) => { const x = j(id); x.vus.add(m.matchId); return x; };
      if (e.joueurId) {
        const x = vu(e.joueurId);
        if (e.type === "tir" || e.type === "coup_franc" || e.type === "penalty") {
          x.tirs++;
          if (e.resultat === "but" || e.resultat === "cadre" || e.resultat === "arrete") x.cadres++;
          if (estBut(e)) x.buts++;
        } else if (e.type === "carton_jaune") x.jaunes++;
        else if (e.type === "carton_rouge") x.rouges++;
      }
      if (e.joueur2Id && estBut(e)) vu(e.joueur2Id).passes++;
    }
    // Les arrets : ceux saisis, ou deduits des tirs adverses arretes (voir arrets.ts), attribues au gardien en jeu.
    for (const [id, n] of Object.entries(arretsDuMatch(m).parGardien)) { const x = j(id); x.vus.add(m.matchId); x.arrets += n; }
  }
  return [...l.values()].map(({ vus, ...x }) => ({ ...x, matchs: vus.size })).sort((a, b) => b.buts - a.buts || b.passes - a.passes || b.tirs - a.tirs);
}

export { NOMS_TRANCHES };
