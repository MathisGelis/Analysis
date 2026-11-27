// src/features/analyse-jeu/analyses-hub.ts
//
// LES ANALYSES DU DATA HUB : ce que l'on peut dire du jeu de l'equipe avec le peu que l'on mesure (tirs, zones, contexte, buts dates, fautes,
// cartons, dispositifs saisis, xG estime). Dispositifs affrontes et leur efficacite, comment on se cree des occasions, comment on en
// concede, le jeu selon le score, le rythme par tranche de 15 minutes, le profil de l'equipe et sa tendance, les dependances. Chaque
// lecture dit sur combien de matchs elle repose : rien n'est affirme sur un echantillon trop petit. Fonctions pures.

import { estBut } from "../direct/stats-direct";
import { croiserSegments, type SegmentSysteme } from "@/features/matchs/systeme";
import { COULOIRS } from "../direct/types";
import { familleDe, filtrerMatchs, MatchJeu } from "./jeu-equipe";
import { arretsDuMatch } from "./arrets";
import { trancheDe, type EvenementJeu } from "./stats-jeu";
import { xgDuTir } from "./xg";

/* --------------------------------------------- types --------------------------------------------- */

export type Fiabilite = "faible" | "moyenne" | "bonne";

/** Un match du hub, avec les dispositifs tels que le staff les a SAISIS (jamais une valeur par defaut). */
export interface MatchHub extends MatchJeu {
  /** Mon dispositif, saisi ; null sinon. */
  formationSaisie?: string | null;
  /** Le dispositif de l'adversaire, saisi ou observe en apres-match ; null sinon. */
  formationAdverse?: string | null;
  /** Les dispositifs au fil du match (coup d'envoi puis changements saisis en direct) : les stats se repartissent au prorata de leur duree. */
  segmentsSaisie?: SegmentSysteme[];
  segmentsAdverse?: SegmentSysteme[];
  /** Duree du match en minutes (au moins 90), pour les poids des segments. */
  dureeMin?: number;
}

export interface Constat {
  id: string;
  domaine: "creation" | "concession" | "adversaires" | "score" | "rythme" | "profil";
  ton: "bon" | "alerte" | "neutre";
  titre: string;
  detail: string;
  /** Une piste de travail ou de changement, quand les chiffres en suggerent une. */
  piste?: string;
  fiabilite: Fiabilite;
}

const estTir = (e: EvenementJeu) => e.type === "tir" || e.type === "coup_franc" || e.type === "penalty";
const estCadre = (e: EvenementJeu) => e.resultat === "but" || e.resultat === "cadre" || e.resultat === "arrete";
const nousDe = (m: MatchJeu) => (m.domicile ? "dom" : "ext") as "dom" | "ext";
const r2 = (x: number) => +x.toFixed(2);
const somme = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const part = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);

/** Un niveau de confiance selon la taille de l'echantillon (matchs ou tirs) : petit = faible, moyen, solide. */
export const fiabiliteDe = (n: number, seuilMoyen: number, seuilBon: number): Fiabilite => (n >= seuilBon ? "bonne" : n >= seuilMoyen ? "moyenne" : "faible");

/** Une zone vue de MON equipe (l'attaque en haut) : les tirs adverses sont retournes (leur tiers offensif est mon tiers defensif, leur gauche est ma droite). */
const indiceZone = (tier: number, couloir: number, retourne: boolean) => (retourne ? (2 - tier) * COULOIRS + (COULOIRS - 1 - couloir) : tier * COULOIRS + couloir);

/* ---------------------------------------- tirs d'un match ---------------------------------------- */

interface TirAnalyse { e: EvenementJeu; xg: number; cadre: boolean; but: boolean; minute: number }
const tirsDe = (m: MatchHub, cote: "nous" | "eux"): TirAnalyse[] => {
  const n = nousDe(m);
  return m.evenements.filter((e) => (e.cote === n) === (cote === "nous") && estTir(e) && !!e.resultat)
    .map((e) => ({ e, xg: xgDuTir(e), cadre: estCadre(e), but: estBut(e), minute: e.minute }));
};

/* ----------------------------------------- les analyses ----------------------------------------- */

export interface Analyses {
  /** Matchs saisis en direct : tout ce qui suit, sauf les dispositifs, ne porte que sur eux. */
  matchsSaisis: number;
  dispositifs: AnalyseDispositifs;
  creation: AnalyseOccasions;
  concession: AnalyseOccasions & { gardien: null | { tirsCadres: number; arrets: number; butsEncaisses: number; xgCadres: number; butsEvites: number } };
  score: AnalyseScore;
  rythme: AnalyseRythme;
  profil: AnalyseProfil;
  dependances: null | { buteur: { joueurId: string; buts: number; part: number } | null; passeur: { joueurId: string; passes: number; part: number } | null; partCpa: number | null; partTransition: number | null; buts: number };
  constats: Constat[];
}

/* ---- dispositifs affrontes ---- */
export interface LigneDispositif {
  formation: string; matchs: number; v: number; n: number; d: number; ptsParMatch: number; bpParMatch: number; bcParMatch: number;
  /** Sur les seuls matchs saisis en direct. */
  saisis: number; tirsPour: number; tirsContre: number; xgPour: number; xgContre: number; xgDiffParMatch: number | null;
  /** L'efficacite de l'adversaire face a nous : sa conversion et ce qu'il a marque de plus (ou de moins) que ses occasions ne le disaient. */
  conversionAdv: number | null; butsAdvMoinsXg: number | null;
  fiabilite: Fiabilite;
}
export interface AnalyseDispositifs {
  couverture: { avec: number; total: number };
  repartition: { formation: string; matchs: number }[];
  lignes: LigneDispositif[];
  /** Pour un dispositif adverse affronte au moins deux fois : le dispositif de chez nous qui a le mieux marche. */
  reponses: { adverse: string; nous: string; matchs: number; ptsParMatch: number }[];
}

/** Un morceau de match joue sous un dispositif : le poids est la part du match (1 quand le dispositif n'a pas change). */
interface PartDispositif { m: MatchHub; formation: string; poids: number; debut: number; fin: number }

/** Les dispositifs d'un cote : les segments saisis, sinon le dispositif du coup d'envoi sur tout le match. */
function segmentsDe(m: MatchHub, cote: "saisie" | "adverse"): SegmentSysteme[] {
  const segments = cote === "saisie" ? m.segmentsSaisie : m.segmentsAdverse;
  if (segments) return segments;
  const f = cote === "saisie" ? m.formationSaisie : m.formationAdverse;
  return f ? [{ formation: f, debut: 0, fin: Number.POSITIVE_INFINITY, poids: 1 }] : [];
}

/** Moyenne ponderee ; null sans poids. */
const moyennePonderee = (valeurs: { x: number; poids: number }[]): number | null => {
  const p = somme(valeurs.map((v) => v.poids));
  return p > 0 ? somme(valeurs.map((v) => v.x * v.poids)) / p : null;
};

function dispositifs(matchs: MatchHub[]): AnalyseDispositifs {
  // Un match se repartit entre les dispositifs adverses qu'il a vus, au prorata de leur duree (un changement de systeme compte pour chacun).
  const parts: PartDispositif[] = matchs.flatMap((m) => segmentsDe(m, "adverse").map((s) => ({ m, formation: s.formation, poids: s.poids, debut: s.debut, fin: s.fin })));
  const avec = matchs.filter((m) => segmentsDe(m, "adverse").length > 0);
  const groupes = new Map<string, PartDispositif[]>();
  for (const p of parts) (groupes.get(p.formation) ?? groupes.set(p.formation, []).get(p.formation)!).push(p);
  const pts = (m: MatchHub) => (m.bp > m.bc ? 3 : m.bp === m.bc ? 1 : 0);
  const lignes = [...groupes].map(([formation, ps]): LigneDispositif => {
    const poids = somme(ps.map((p) => p.poids));
    const saisis = ps.filter((p) => p.m.evenements.length > 0);
    const poidsSaisis = somme(saisis.map((p) => p.poids));
    // Seuls les tirs pris pendant que le dispositif etait en place comptent pour lui.
    const dansLaPart = (p: PartDispositif, cote: "nous" | "eux") => tirsDe(p.m, cote).filter((t) => t.minute >= p.debut && t.minute < p.fin);
    const pour = saisis.flatMap((p) => dansLaPart(p, "nous")), contre = saisis.flatMap((p) => dansLaPart(p, "eux"));
    const xgPour = r2(somme(pour.map((t) => t.xg))), xgContre = r2(somme(contre.map((t) => t.xg)));
    const butsAdv = contre.filter((t) => t.but).length;
    const part3 = (f: (m: MatchHub) => boolean) => r2(somme(ps.filter((p) => f(p.m)).map((p) => p.poids)));
    return {
      formation, matchs: r2(poids), v: part3((m) => m.bp > m.bc), n: part3((m) => m.bp === m.bc), d: part3((m) => m.bp < m.bc),
      ptsParMatch: r2(moyennePonderee(ps.map((p) => ({ x: pts(p.m), poids: p.poids }))) ?? 0),
      bpParMatch: r2(moyennePonderee(ps.map((p) => ({ x: p.m.bp, poids: p.poids }))) ?? 0),
      bcParMatch: r2(moyennePonderee(ps.map((p) => ({ x: p.m.bc, poids: p.poids }))) ?? 0),
      saisis: r2(poidsSaisis), tirsPour: pour.length, tirsContre: contre.length, xgPour, xgContre,
      xgDiffParMatch: poidsSaisis > 0 ? r2((xgPour - xgContre) / poidsSaisis) : null,
      conversionAdv: part(butsAdv, contre.length), butsAdvMoinsXg: poidsSaisis > 0 ? r2(butsAdv - xgContre) : null,
      fiabilite: fiabiliteDe(poids, 3, 6),
    };
  }).sort((a, b) => b.matchs - a.matchs || a.formation.localeCompare(b.formation));

  // Notre meilleure reponse a chaque dispositif adverse affronte au moins deux matchs : les couples sont ceux tenus en meme temps.
  const couples = matchs.flatMap((m) => croiserSegments(segmentsDe(m, "adverse"), segmentsDe(m, "saisie"), m.dureeMin ?? 90).map((c) => ({ ...c, m })));
  const reponses: AnalyseDispositifs["reponses"] = [];
  for (const [adverse, ps] of groupes) {
    if (somme(ps.map((p) => p.poids)) < 2) continue;
    const parNous = new Map<string, typeof couples>();
    for (const c of couples.filter((x) => x.adverse === adverse)) (parNous.get(c.nous) ?? parNous.set(c.nous, []).get(c.nous)!).push(c);
    const meilleurs = [...parNous].map(([nous, l]) => ({ adverse, nous, matchs: r2(somme(l.map((c) => c.poids))), ptsParMatch: r2(moyennePonderee(l.map((c) => ({ x: pts(c.m), poids: c.poids }))) ?? 0) }))
      .sort((a, b) => b.ptsParMatch - a.ptsParMatch || b.matchs - a.matchs);
    if (meilleurs[0]) reponses.push(meilleurs[0]);
  }
  return { couverture: { avec: avec.length, total: matchs.length }, repartition: lignes.map((l) => ({ formation: l.formation, matchs: l.matchs })), lignes, reponses };
}

/* ---- occasions creees / concedees ---- */
export interface AnalyseOccasions {
  tirs: number; buts: number; xg: number;
  /** 15 zones vues de mon equipe, l'attaque en haut : tirs, buts et xG par zone. */
  zones: { tirs: number[]; buts: number[]; xg: number[]; sansZone: number };
  /** Gauche / axe / droite de mon equipe (la part des occasions et du xG). */
  couloirs: { nom: "gauche" | "axe" | "droite"; tirs: number; xg: number }[];
  familles: { famille: string; tirs: number; buts: number; xg: number }[];
  /** Qualite des occasions : nombre de tirs par tranche de xG. */
  qualite: { nom: string; tirs: number }[];
  /** Grosses occasions (xG de 0,3 ou plus) et part marquee. */
  grosses: { total: number; marquees: number };
  /** Passeur -> tireur, les liens les plus frequents (seulement pour la creation). */
  reseau: { passeurId: string; tireurId: string; tirs: number; buts: number; xg: number }[];
}

const BINS = [{ nom: "Très faible (< 0,05)", max: 0.05 }, { nom: "Faible (0,05–0,1)", max: 0.1 }, { nom: "Moyenne (0,1–0,2)", max: 0.2 }, { nom: "Bonne (0,2–0,4)", max: 0.4 }, { nom: "Grosse (≥ 0,4)", max: Infinity }];

function occasions(matchs: MatchHub[], cote: "nous" | "eux"): AnalyseOccasions {
  const retourne = cote === "eux";
  const tirs = matchs.flatMap((m) => tirsDe(m, cote));
  const zones = { tirs: Array(15).fill(0) as number[], buts: Array(15).fill(0) as number[], xg: Array(15).fill(0) as number[], sansZone: 0 };
  const couloirs = [{ nom: "gauche" as const, tirs: 0, xg: 0 }, { nom: "axe" as const, tirs: 0, xg: 0 }, { nom: "droite" as const, tirs: 0, xg: 0 }];
  const familles = new Map<string, { tirs: number; buts: number; xg: number }>();
  const qualite = BINS.map((b) => ({ nom: b.nom, tirs: 0 }));
  for (const t of tirs) {
    const { zoneTier: tier, zoneCouloir: c } = t.e;
    if (tier == null || c == null) zones.sansZone++;
    else {
      const i = indiceZone(tier, c, retourne);
      zones.tirs[i]++; zones.xg[i] += t.xg; if (t.but) zones.buts[i]++;
      const mon = i % COULOIRS;                          // mon couloir (deja retourne pour l'adversaire)
      const g = mon <= 1 ? 0 : mon === 2 ? 1 : 2;
      couloirs[g].tirs++; couloirs[g].xg += t.xg;
    }
    const contexte = (t.e.contextes ?? []).map(familleDe).find((f) => f !== "Autre") ?? ((t.e.contextes ?? []).length ? "Autre" : "Non précisé");
    const f = familles.get(contexte) ?? familles.set(contexte, { tirs: 0, buts: 0, xg: 0 }).get(contexte)!;
    f.tirs++; f.xg += t.xg; if (t.but) f.buts++;
    qualite[BINS.findIndex((b) => t.xg < b.max)].tirs++;
  }
  const reseau = new Map<string, { passeurId: string; tireurId: string; tirs: number; buts: number; xg: number }>();
  if (cote === "nous") {
    for (const m of matchs) for (const e of m.evenements) {
      if (e.cote !== nousDe(m) || !estTir(e) || !e.resultat || !e.joueurId || !e.joueur2Id) continue;
      const cle = `${e.joueur2Id}>${e.joueurId}`;
      const l = reseau.get(cle) ?? reseau.set(cle, { passeurId: e.joueur2Id, tireurId: e.joueurId, tirs: 0, buts: 0, xg: 0 }).get(cle)!;
      l.tirs++; l.xg += xgDuTir(e); if (estBut(e)) l.buts++;
    }
  }
  return {
    tirs: tirs.length, buts: tirs.filter((t) => t.but).length, xg: r2(somme(tirs.map((t) => t.xg))),
    zones: { ...zones, xg: zones.xg.map(r2) }, couloirs: couloirs.map((c) => ({ ...c, xg: r2(c.xg) })),
    familles: [...familles].map(([famille, l]) => ({ famille, ...l, xg: r2(l.xg) })).sort((a, b) => b.tirs - a.tirs),
    qualite, grosses: { total: tirs.filter((t) => t.xg >= 0.3).length, marquees: tirs.filter((t) => t.xg >= 0.3 && t.but).length },
    reseau: [...reseau.values()].map((l) => ({ ...l, xg: r2(l.xg) })).sort((a, b) => b.buts - a.buts || b.tirs - a.tirs || b.xg - a.xg).slice(0, 6),
  };
}

/* ---- le jeu selon le score ---- */
export type EtatScore = "mene" | "egalite" | "mene_par_adv";
export interface AnalyseScore {
  /** Pour chaque etat du match : minutes jouees, tirs et xG pour/contre, ramenes a 90 minutes. */
  etats: { etat: EtatScore; minutes: number; tirsPour: number; tirsContre: number; xgPour: number; xgContre: number; xgPour90: number | null; xgContre90: number | null }[];
  /** Matchs retenus : ceux dont les buts sont dates par le direct. */
  matchs: number;
}

const DUREE_MATCH = 90;
function etatsDuScore(matchs: MatchHub[]): AnalyseScore {
  const cumul: Record<EtatScore, { minutes: number; tirsPour: number; tirsContre: number; xgPour: number; xgContre: number }> = {
    mene: { minutes: 0, tirsPour: 0, tirsContre: 0, xgPour: 0, xgContre: 0 }, egalite: { minutes: 0, tirsPour: 0, tirsContre: 0, xgPour: 0, xgContre: 0 },
    mene_par_adv: { minutes: 0, tirsPour: 0, tirsContre: 0, xgPour: 0, xgContre: 0 },
  };
  let retenus = 0;
  const etat = (ecart: number): EtatScore => (ecart > 0 ? "mene" : ecart < 0 ? "mene_par_adv" : "egalite");
  for (const m of matchs) {
    const buts = m.evenements.filter(estBut).sort((a, b) => a.minute - b.minute);
    // Un match saisi dont les buts du direct ne donnent pas le score est ecarte : l'etat du match serait faux.
    const nous = buts.filter((b) => b.cote === nousDe(m)).length, eux = buts.length - nous;
    if (m.evenements.length === 0 || nous !== m.bp || eux !== m.bc) continue;
    retenus++;
    const fin = Math.max(DUREE_MATCH, ...m.evenements.map((e) => e.minute));
    let ecart = 0, depuis = 0;
    for (const b of buts) {
      cumul[etat(ecart)].minutes += Math.max(0, b.minute - depuis);
      depuis = Math.max(depuis, b.minute);
      ecart += b.cote === nousDe(m) ? 1 : -1;
    }
    cumul[etat(ecart)].minutes += Math.max(0, fin - depuis);
    for (const cote of ["nous", "eux"] as const) {
      for (const t of tirsDe(m, cote)) {
        const avant = buts.filter((b) => b !== t.e && b.minute < t.minute).reduce((s, b) => s + (b.cote === nousDe(m) ? 1 : -1), 0);
        const c = cumul[etat(avant)];
        if (cote === "nous") { c.tirsPour++; c.xgPour += t.xg; } else { c.tirsContre++; c.xgContre += t.xg; }
      }
    }
  }
  const par90 = (xg: number, minutes: number) => (minutes >= 30 ? r2((xg / minutes) * 90) : null);
  return {
    matchs: retenus,
    etats: (["mene", "egalite", "mene_par_adv"] as EtatScore[]).map((k) => {
      const c = cumul[k];
      return { etat: k, minutes: Math.round(c.minutes), tirsPour: c.tirsPour, tirsContre: c.tirsContre, xgPour: r2(c.xgPour), xgContre: r2(c.xgContre), xgPour90: par90(c.xgPour, c.minutes), xgContre90: par90(c.xgContre, c.minutes) };
    }),
  };
}

/* ---- le rythme : par tranche de 15 minutes ---- */
export interface AnalyseRythme {
  tirsPour: number[]; tirsContre: number[]; xgPour: number[]; xgContre: number[]; butsPour: number[]; butsContre: number[];
  fautes: number[]; cartons: { pour: number[]; contre: number[] };
}
function rythme(matchs: MatchHub[]): AnalyseRythme {
  const v = () => Array(6).fill(0) as number[];
  const r: AnalyseRythme = { tirsPour: v(), tirsContre: v(), xgPour: v(), xgContre: v(), butsPour: v(), butsContre: v(), fautes: v(), cartons: { pour: v(), contre: v() } };
  for (const m of matchs) for (const e of m.evenements) {
    const pour = e.cote === nousDe(m), t = trancheDe(e.minute);
    if (estTir(e) && e.resultat) {
      (pour ? r.tirsPour : r.tirsContre)[t]++; (pour ? r.xgPour : r.xgContre)[t] += xgDuTir(e);
      if (estBut(e)) (pour ? r.butsPour : r.butsContre)[t]++;
    } else if (e.type === "faute" && pour) r.fautes[t]++;
    else if (e.type === "carton_jaune" || e.type === "carton_rouge") (pour ? r.cartons.pour : r.cartons.contre)[t]++;
  }
  r.xgPour = r.xgPour.map(r2); r.xgContre = r.xgContre.map(r2);
  return r;
}

/* ---- profil et tendance : la saison contre les 5 derniers matchs ---- */
export interface Indicateur { cle: string; libelle: string; saison: number | null; recent: number | null; /** Plus haut = mieux ? */ meilleurSiHaut: boolean; unite: "" | "%" }
export interface AnalyseProfil {
  recents: number;
  indicateurs: Indicateur[];
  /** Six axes, base 100 = la saison : au-dessus de 100, les 5 derniers matchs sont meilleurs (une defense qui encaisse moins est « meilleure »). */
  radar: { axe: string; saison: 100; recent: number | null }[];
}

function indicateurs(matchs: MatchHub[]): Record<string, number | null> {
  const saisis = matchs.filter((m) => m.evenements.length > 0);
  const n = matchs.length, ns = saisis.length;
  const pour = saisis.flatMap((m) => tirsDe(m, "nous")), contre = saisis.flatMap((m) => tirsDe(m, "eux"));
  const par = (x: number, d: number) => (d > 0 ? r2(x / d) : null);
  const fautes = somme(saisis.map((m) => m.evenements.filter((e) => e.type === "faute" && e.cote === nousDe(m)).length));
  const cartons = somme(matchs.map((m) => m.evenements.filter((e) => (e.type === "carton_jaune" || e.type === "carton_rouge") && e.cote === nousDe(m)).length));
  const xgP = somme(pour.map((t) => t.xg)), xgC = somme(contre.map((t) => t.xg));
  const buts = pour.filter((t) => t.but).length;
  return {
    pts: par(somme(matchs.map((m) => (m.bp > m.bc ? 3 : m.bp === m.bc ? 1 : 0))), n),
    butsPour: par(somme(matchs.map((m) => m.bp)), n), butsContre: par(somme(matchs.map((m) => m.bc)), n),
    xgPour: par(xgP, ns), xgContre: par(xgC, ns), tirsPour: par(pour.length, ns), tirsContre: par(contre.length, ns),
    cadresPct: part(pour.filter((t) => t.cadre).length, pour.length), conversion: part(buts, pour.length),
    grossesPour: par(pour.filter((t) => t.xg >= 0.3).length, ns), grossesContre: par(contre.filter((t) => t.xg >= 0.3).length, ns),
    fautes: par(fautes, ns), cartons: par(cartons, ns),
    finition: xgP > 0 ? r2(buts / xgP) : null,
  };
}

const DEFS: { cle: string; libelle: string; haut: boolean; unite?: "%" }[] = [
  { cle: "pts", libelle: "Points par match", haut: true }, { cle: "butsPour", libelle: "Buts marqués par match", haut: true }, { cle: "butsContre", libelle: "Buts encaissés par match", haut: false },
  { cle: "xgPour", libelle: "xG créé par match", haut: true }, { cle: "xgContre", libelle: "xG concédé par match", haut: false },
  { cle: "tirsPour", libelle: "Tirs par match", haut: true }, { cle: "tirsContre", libelle: "Tirs concédés par match", haut: false },
  { cle: "cadresPct", libelle: "Tirs cadrés", haut: true, unite: "%" }, { cle: "conversion", libelle: "Conversion", haut: true, unite: "%" },
  { cle: "grossesPour", libelle: "Grosses occasions créées par match", haut: true }, { cle: "grossesContre", libelle: "Grosses occasions concédées par match", haut: false },
  { cle: "fautes", libelle: "Fautes par match", haut: false }, { cle: "cartons", libelle: "Cartons par match", haut: false },
];

function profil(matchs: MatchHub[]): AnalyseProfil {
  const ordre = filtrerMatchs(matchs, "tous", null);
  const recents = ordre.slice(-5);
  const s = indicateurs(ordre), r = indicateurs(recents);
  const indices = DEFS.map((d): Indicateur => ({ cle: d.cle, libelle: d.libelle, saison: s[d.cle], recent: r[d.cle], meilleurSiHaut: d.haut, unite: d.unite ?? "" }));
  // Indice base 100 : au-dessus de 100 = les 5 derniers matchs sont meilleurs (le sens est retourne quand plus bas vaut mieux). Borne a 40-160.
  const indice = (cle: string, haut: boolean): number | null => {
    const a = s[cle], b = r[cle];
    if (a === null || b === null) return null;
    const EPS = 0.05;                      // un zero (aucun but encaisse, aucune faute) reste lisible : borne a 160 plutot que sans reponse
    return Math.round(Math.min(160, Math.max(40, (haut ? (b + EPS) / (a + EPS) : (a + EPS) / (b + EPS)) * 100)));
  };
  return {
    recents: recents.length, indicateurs: indices,
    radar: [
      { axe: "Création", saison: 100, recent: indice("xgPour", true) }, { axe: "Finition", saison: 100, recent: indice("finition", true) },
      { axe: "Défense", saison: 100, recent: indice("xgContre", false) }, { axe: "Solidité", saison: 100, recent: indice("butsContre", false) },
      { axe: "Volume", saison: 100, recent: indice("tirsPour", true) }, { axe: "Discipline", saison: 100, recent: indice("cartons", false) },
    ],
  };
}

/* ---- dependances ---- */
function dependances(matchs: MatchHub[]): Analyses["dependances"] {
  const buts = matchs.flatMap((m) => m.evenements.filter((e) => e.cote === nousDe(m) && estBut(e)));
  if (buts.length < 5) return null;
  const compte = (ids: (string | null | undefined)[]) => { const c = new Map<string, number>(); for (const i of ids) if (i) c.set(i, (c.get(i) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0] ?? null; };
  const buteur = compte(buts.map((b) => b.joueurId)), passeur = compte(buts.map((b) => b.joueur2Id));
  const cpa = buts.filter((b) => b.type === "penalty" || b.type === "coup_franc" || (b.contextes ?? []).some((c) => familleDe(c) === "Coup de pied arrêté")).length;
  const transition = buts.filter((b) => (b.contextes ?? []).some((c) => familleDe(c) === "Transition")).length;
  return {
    buts: buts.length,
    buteur: buteur ? { joueurId: buteur[0], buts: buteur[1], part: Math.round((buteur[1] / buts.length) * 100) } : null,
    passeur: passeur ? { joueurId: passeur[0], passes: passeur[1], part: Math.round((passeur[1] / buts.length) * 100) } : null,
    partCpa: part(cpa, buts.length), partTransition: part(transition, buts.length),
  };
}

/* ------------------------------------------ l'ensemble ------------------------------------------ */

export function analyserHub(matchs: MatchHub[]): Analyses {
  const saisis = matchs.filter((m) => m.evenements.length > 0);
  const creation = occasions(saisis, "nous");
  const concede = occasions(saisis, "eux");
  const arrets = somme(saisis.map((m) => arretsDuMatch(m).total));
  const cadresConcedes = saisis.flatMap((m) => tirsDe(m, "eux")).filter((t) => t.cadre);
  const xgCadres = r2(somme(cadresConcedes.map((t) => t.xg)));
  const butsEncaisses = cadresConcedes.filter((t) => t.but).length;
  const analyses: Analyses = {
    matchsSaisis: saisis.length,
    dispositifs: dispositifs(matchs),
    creation,
    concession: { ...concede, gardien: saisis.length ? { tirsCadres: cadresConcedes.length, arrets, butsEncaisses, xgCadres, butsEvites: r2(xgCadres - butsEncaisses) } : null },
    score: etatsDuScore(saisis), rythme: rythme(saisis), profil: profil(matchs), dependances: dependances(saisis), constats: [],
  };
  analyses.constats = constatsDuHub(analyses);
  return analyses;
}

/* ------------------------------------------- interpretations ------------------------------------------- */

const NOMS_TRANCHES = ["0–15", "15–30", "30–45", "45–60", "60–75", "75–90"];

/** Les lectures que les chiffres permettent, chacune avec sa fiabilite et, quand c'est utile, une piste. 10 au plus, les alertes d'abord. */
export function constatsDuHub(a: Analyses): Constat[] {
  const l: Constat[] = [];
  const n = a.matchsSaisis;
  if (n === 0) return l;
  const { creation: c, concession: d } = a;

  // Efficacite : buts contre xG.
  if (c.tirs >= 15) {
    const ecart = r2(c.buts - c.xg);
    const f = fiabiliteDe(c.tirs, 15, 40);
    if (ecart >= 2) l.push({ id: "finition_haute", domaine: "creation", ton: "bon", titre: "Une finition au-dessus des occasions", fiabilite: f,
      detail: `${c.buts} but${c.buts > 1 ? "s" : ""} pour ${c.xg.toFixed(1)} xG créés (+${ecart.toFixed(1)}). C'est rarement tenable sur la durée : une part de réussite est probable.`,
      piste: "Continuer à créer autant : si les occasions restent là, les buts suivront même quand la réussite baissera." });
    else if (ecart <= -2) l.push({ id: "finition_basse", domaine: "creation", ton: "alerte", titre: "Des occasions qui ne se transforment pas", fiabilite: f,
      detail: `${c.buts} but${c.buts > 1 ? "s" : ""} pour ${c.xg.toFixed(1)} xG créés (${ecart.toFixed(1)}). Les occasions sont là, pas les buts : manque de réussite ou de finition.`,
      piste: "Travailler la finition (frappes sous pression, 1 contre 1) ; ne pas changer la façon de créer, qui fonctionne." });
  }
  // Qualite des tirs.
  if (c.tirs >= 20) {
    const parTir = c.xg / c.tirs;
    const tirsParMatch = c.tirs / n;
    if (parTir < 0.08 && tirsParMatch >= 8) l.push({ id: "tirs_faibles", domaine: "creation", ton: "alerte", titre: "Beaucoup de tirs, peu de danger", fiabilite: fiabiliteDe(c.tirs, 20, 50),
      detail: `${tirsParMatch.toFixed(1)} tirs par match mais seulement ${parTir.toFixed(2)} xG par tir : la plupart partent de loin ou excentrés.`,
      piste: "Chercher des tirs plus près de l'axe et du but (jeu entre les lignes, centres en retrait) plutôt que des frappes lointaines." });
  }
  // Zone de creation dominante.
  const zonesTot = c.zones.tirs.reduce((s, x) => s + x, 0);
  if (zonesTot >= 15) {
    const g = [...c.couloirs].sort((x, y) => y.xg - x.xg)[0];
    const partXg = c.xg > 0 ? Math.round((g.xg / c.zones.xg.reduce((s, x) => s + x, 0)) * 100) : 0;
    if (partXg >= 50) l.push({ id: "creation_couloir", domaine: "creation", ton: "neutre", titre: `On crée surtout par ${g.nom === "axe" ? "l'axe" : `le couloir ${g.nom}`}`, fiabilite: fiabiliteDe(zonesTot, 15, 40),
      detail: `${partXg} % du danger créé (xG) vient ${g.nom === "axe" ? "de l'axe" : `du couloir ${g.nom}`}.`, piste: "Un adversaire qui l'a repéré fermera cette zone : prévoir une seconde source de danger." });
  }
  // Concession : couloir, familles.
  const zonesC = d.zones.tirs.reduce((s, x) => s + x, 0);
  if (zonesC >= 15) {
    const g = [...d.couloirs].sort((x, y) => y.xg - x.xg)[0];
    const total = d.couloirs.reduce((s, x) => s + x.xg, 0);
    const partXg = total > 0 ? Math.round((g.xg / total) * 100) : 0;
    if (partXg >= 45) l.push({ id: "concession_couloir", domaine: "concession", ton: "alerte", titre: `On concède surtout par ${g.nom === "axe" ? "l'axe" : `le couloir ${g.nom}`}`, fiabilite: fiabiliteDe(zonesC, 15, 40),
      detail: `${partXg} % du danger concédé (xG) vient ${g.nom === "axe" ? "de l'axe" : `du couloir ${g.nom}`}, vu de notre équipe.`,
      piste: g.nom === "axe" ? "Resserrer l'entrejeu et protéger la zone devant la surface." : `Aider le latéral et l'ailier du côté ${g.nom} (décalage, couverture), ou orienter le jeu adverse vers l'autre côté.` });
  }
  if (d.tirs >= 10) {
    const trans = d.familles.find((f) => f.famille === "Transition"), cpa = d.familles.find((f) => f.famille === "Coup de pied arrêté");
    if (trans && trans.tirs / d.tirs >= 0.4) l.push({ id: "concession_transition", domaine: "concession", ton: "alerte", titre: "Vulnérables en transition", fiabilite: fiabiliteDe(d.tirs, 10, 30),
      detail: `${Math.round((trans.tirs / d.tirs) * 100)} % des tirs concédés viennent de contre-attaques ou de récupérations hautes.`, piste: "Soigner l'équilibre après perte de balle : rester compact derrière le ballon, retarder la première passe adverse." });
    if (cpa && cpa.tirs / d.tirs >= 0.3) l.push({ id: "concession_cpa", domaine: "concession", ton: "alerte", titre: "Les coups de pied arrêtés coûtent cher", fiabilite: fiabiliteDe(d.tirs, 10, 30),
      detail: `${Math.round((cpa.tirs / d.tirs) * 100)} % des tirs concédés viennent d'un coup de pied arrêté ou d'un penalty (${cpa.buts} but${cpa.buts > 1 ? "s" : ""}).`, piste: "Revoir l'organisation défensive sur corners et coups francs (zone ou individuelle) et la discipline dans la surface." });
  }
  // Gardien.
  if (d.gardien && d.gardien.tirsCadres >= 8) {
    const e = d.gardien.butsEvites;
    if (e >= 1.5) l.push({ id: "gardien_haut", domaine: "concession", ton: "bon", titre: "Un gardien qui sauve des buts", fiabilite: fiabiliteDe(d.gardien.tirsCadres, 8, 25),
      detail: `${d.gardien.arrets} arrêt${d.gardien.arrets > 1 ? "s" : ""} sur ${d.gardien.tirsCadres} tirs cadrés : ${d.gardien.butsEncaisses} but${d.gardien.butsEncaisses > 1 ? "s" : ""} encaissé${d.gardien.butsEncaisses > 1 ? "s" : ""} pour ${d.gardien.xgCadres.toFixed(1)} xG cadrés (+${e.toFixed(1)} de buts évités).` });
    else if (e <= -1.5) l.push({ id: "gardien_bas", domaine: "concession", ton: "alerte", titre: "Plus de buts encaissés que les tirs cadrés ne le laissaient prévoir", fiabilite: fiabiliteDe(d.gardien.tirsCadres, 8, 25),
      detail: `${d.gardien.butsEncaisses} but${d.gardien.butsEncaisses > 1 ? "s" : ""} pour ${d.gardien.xgCadres.toFixed(1)} xG cadrés (${e.toFixed(1)}).`, piste: "Regarder les zones des buts encaissés dans la cage et les situations (1 contre 1, tirs rapprochés) avec le gardien." });
  }
  // Selon le score.
  const e = Object.fromEntries(a.score.etats.map((x) => [x.etat, x]));
  if (a.score.matchs >= 4) {
    const f = fiabiliteDe(a.score.matchs, 4, 10);
    if (e.mene_par_adv.xgPour90 !== null && e.egalite.xgPour90 !== null && e.egalite.xgPour90 > 0) {
      const ratio = e.mene_par_adv.xgPour90 / e.egalite.xgPour90;
      if (ratio >= 1.3) l.push({ id: "reaction_mene", domaine: "score", ton: "bon", titre: "L'équipe réagit quand elle est menée", fiabilite: f,
        detail: `Menée, elle crée ${e.mene_par_adv.xgPour90.toFixed(2)} xG par 90 min contre ${e.egalite.xgPour90.toFixed(2)} à égalité.` });
      else if (ratio <= 0.7) l.push({ id: "reaction_mene", domaine: "score", ton: "alerte", titre: "L'équipe baisse la tête quand elle est menée", fiabilite: f,
        detail: `Menée, elle ne crée que ${e.mene_par_adv.xgPour90.toFixed(2)} xG par 90 min contre ${e.egalite.xgPour90.toFixed(2)} à égalité.`, piste: "Préparer des consignes et des changements pour renverser un match mal embarqué." });
    }
    if (e.mene.xgContre90 !== null && e.egalite.xgContre90 !== null && e.egalite.xgContre90 > 0 && e.mene.xgContre90 / e.egalite.xgContre90 >= 1.4) {
      l.push({ id: "recul_mene", domaine: "score", ton: "alerte", titre: "On recule quand on mène", fiabilite: f,
        detail: `En menant, on concède ${e.mene.xgContre90.toFixed(2)} xG par 90 min contre ${e.egalite.xgContre90.toFixed(2)} à égalité.`, piste: "Garder le ballon et la hauteur du bloc pour gérer l'avantage plutôt que de se replier." });
    }
  }
  // Rythme : le moment ou l'on encaisse.
  const butsC = a.rythme.butsContre, totC = somme(butsC);
  if (totC >= 6) {
    const imax = butsC.indexOf(Math.max(...butsC));
    if (butsC[imax] / totC >= 0.35) l.push({ id: "moment_encaisse", domaine: "rythme", ton: "alerte", titre: `On encaisse surtout entre la ${NOMS_TRANCHES[imax]}`, fiabilite: fiabiliteDe(totC, 6, 14),
      detail: `${butsC[imax]} des ${totC} buts encaissés (${Math.round((butsC[imax] / totC) * 100)} %) tombent dans cette tranche.`,
      piste: imax >= 4 ? "Fatigue ou relâchement en fin de match : revoir la gestion des changements et de l'effort." : imax === 0 ? "Entrée dans le match : soigner la mise en route et l'échauffement." : "Repérer ce qui change à ce moment (retour de mi-temps, changements adverses)." });
  }
  const xgC = a.rythme.xgContre, xgCtot = somme(xgC);
  if (xgCtot >= 3 && xgC[5] / xgCtot >= 0.28 && a.rythme.butsContre[5] === 0) l.push({ id: "fin_dangereuse", domaine: "rythme", ton: "neutre", titre: "Beaucoup de danger concédé en fin de match", fiabilite: fiabiliteDe(Math.round(xgCtot), 3, 8),
    detail: `${Math.round((xgC[5] / xgCtot) * 100)} % du xG concédé arrive entre la 75e et la fin, sans que cela se soit encore payé.` });
  // Dispositifs.
  const disp = a.dispositifs;
  if (disp.couverture.avec >= 3) {
    const pire = disp.lignes.filter((x) => x.matchs >= 3).sort((x, y) => x.ptsParMatch - y.ptsParMatch)[0];
    const meilleur = disp.lignes.filter((x) => x.matchs >= 3).sort((x, y) => y.ptsParMatch - x.ptsParMatch)[0];
    if (pire && pire.ptsParMatch <= 0.8) l.push({ id: "dispositif_difficile", domaine: "adversaires", ton: "alerte", titre: `Des difficultés face au ${pire.formation}`, fiabilite: pire.fiabilite,
      detail: `${pire.v}V ${pire.n}N ${pire.d}D en ${pire.matchs} matchs (${pire.ptsParMatch.toFixed(2)} pt par match).`,
      piste: disp.reponses.find((r) => r.adverse === pire.formation) ? `Notre meilleure réponse jusqu'ici : le ${disp.reponses.find((r) => r.adverse === pire.formation)!.nous}.` : "Préparer une réponse tactique spécifique à ce dispositif (largeur, supériorité au milieu)." });
    if (meilleur && meilleur !== pire && meilleur.ptsParMatch >= 2.2) l.push({ id: "dispositif_facile", domaine: "adversaires", ton: "bon", titre: `À l'aise face au ${meilleur.formation}`, fiabilite: meilleur.fiabilite,
      detail: `${meilleur.v}V ${meilleur.n}N ${meilleur.d}D en ${meilleur.matchs} matchs (${meilleur.ptsParMatch.toFixed(2)} pts par match).` });
  }
  // Dependances.
  const dep = a.dependances;
  if (dep?.buteur && dep.buteur.part >= 45 && dep.buts >= 6) l.push({ id: "dependance_buteur", domaine: "profil", ton: "alerte", titre: "Une forte dépendance à un buteur", fiabilite: fiabiliteDe(dep.buts, 6, 15),
    detail: `Un seul joueur a marqué ${dep.buteur.part} % des buts saisis (${dep.buteur.buts} sur ${dep.buts}).`, piste: "Diversifier les sources de buts ; anticiper son absence (blessure, suspension)." });
  if (dep && dep.partCpa !== null && dep.partCpa >= 35 && dep.buts >= 6) l.push({ id: "dependance_cpa", domaine: "profil", ton: "neutre", titre: "Beaucoup de buts sur coups de pied arrêtés", fiabilite: fiabiliteDe(dep.buts, 6, 15),
    detail: `${dep.partCpa} % des buts viennent d'un coup de pied arrêté ou d'un penalty : une vraie arme, mais qui s'éteint si l'on n'obtient pas de CPA.` });
  // Tendance (5 derniers).
  if (a.profil.recents >= 4 && n >= 6) {
    const axes = a.profil.radar.filter((r) => r.recent !== null);
    const hausse = axes.filter((r) => (r.recent as number) >= 120), baisse = axes.filter((r) => (r.recent as number) <= 80);
    if (hausse.length) l.push({ id: "tendance_haut", domaine: "profil", ton: "bon", titre: `En progrès sur les ${a.profil.recents} derniers matchs`, fiabilite: "faible",
      detail: `Mieux que la moyenne de la saison : ${hausse.map((h) => h.axe.toLowerCase()).join(", ")}.` });
    if (baisse.length) l.push({ id: "tendance_bas", domaine: "profil", ton: "alerte", titre: `En recul sur les ${a.profil.recents} derniers matchs`, fiabilite: "faible",
      detail: `Moins bien que la moyenne de la saison : ${baisse.map((h) => h.axe.toLowerCase()).join(", ")}.`, piste: "Vérifier ce qui a changé (effectif, dispositif, calendrier, charge)." });
  }
  const poids = { alerte: 0, bon: 1, neutre: 2 } as const;
  const rang = { bonne: 0, moyenne: 1, faible: 2 } as const;
  return l.map((x, i) => ({ x, i })).sort((a1, b1) => poids[a1.x.ton] - poids[b1.x.ton] || rang[a1.x.fiabilite] - rang[b1.x.fiabilite] || a1.i - b1.i).map((s) => s.x).slice(0, 10);
}
