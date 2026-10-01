// src/features/joueurs/fatigue.ts
//
// Score de FATIGUE d'un joueur, 0 (frais) a 100 (surcharge), a partir de sa charge d'entrainement
// ET de sa charge en match. Fonctions pures : la date du jour est un parametre, jamais lue ici.
//
// Un seul score, decompose en quatre facteurs lisibles (chacun est une "pression" de 0 a 100) :
//
//   1. Charge relative (ACWR, 40 %)      charge des 7 derniers jours / charge hebdomadaire moyenne sur
//                                         28 jours. Sweet spot 0,8-1,3 ; au-dela de 1,5 le risque de
//                                         blessure grimpe (Gabbett 2016, Hulin 2016).
//   2. Charge residuelle 72 h (30 %)     ce qui reste dans les jambes des derniers jours : chaque effort
//                                         (seance ou match) decroit de moitie environ tous les 1,5 jour.
//   3. Congestion de matchs (20 %)       minutes jouees sur 7 et 14 jours : deux matchs pleins en une
//                                         semaine = pression maximale.
//   4. Vulnerabilite (10 %)              blessures anterieures, retour de blessure recent, age.
//
// Charge d'une seance = UA-RPE deja calculee (duree x RPE modulee). Charge d'un match =
// minutes jouees x RPE de match (7,5 : un match plein ~ 675 UA, comme une grosse seance).
//
// Le score n'invente rien : sans aucun effort connu sur 28 jours, ou joueur indisponible, il vaut
// null et la raison est donnee. Sans seance connue (joueur d'un autre club), il est calcule sur les
// matchs seuls et marque "estimation".

export const RPE_MATCH = 7.5;
export const FENETRE_AIGUE = 7;        // jours
export const FENETRE_CHRONIQUE = 28;   // jours
const DEMI_VIE_RESIDUELLE = 1.5;       // jours (constante de decroissance)
const ECHELLE_RESIDUELLE = 800;        // UA residuelles = pression 100

export interface Effort {
  date: Date;
  /** Charge en UA-RPE. */
  ua: number;
  source: "match" | "entrainement";
  /** Minutes jouees (matchs). */
  minutes?: number;
}

export interface EntreeFatigue {
  aujourdhui: Date;
  efforts: Effort[];
  /** Statut "Indisponible" : pas de score de fatigue, il n'a pas de sens. */
  indisponible: boolean;
  /** Statut "Reprise" : retour de blessure en cours. */
  enReprise: boolean;
  blessuresAnt: number;
  /** Fin estimee de la derniere indisponibilite (deja passee), pour reperer un retour recent. */
  finDerniereBlessure?: Date | null;
  age?: number | null;
  /** "complet" : seances + matchs connus ; "matchs" : matchs seuls (estimation). */
  sources: "complet" | "matchs";
}

export type NiveauFatigue = "frais" | "normal" | "charge" | "surcharge";
export type CleFacteur = "acwr" | "residuelle" | "congestion" | "vulnerabilite";

export interface FacteurFatigue {
  cle: CleFacteur;
  libelle: string;
  /** Pression du facteur, 0-100. */
  pression: number;
  poids: number;
  /** Points apportes au score (pression x poids). */
  points: number;
  detail: string;
}

export interface ResultatFatigue {
  score: number | null;
  niveau: NiveauFatigue | null;
  /** Pourquoi il n'y a pas de score. */
  raison: "indisponible" | "aucune_donnee" | null;
  /** "solide" : au moins 2 semaines d'historique avec seances ; sinon "partielle" (a prendre comme estimation). */
  fiabilite: "solide" | "partielle";
  acwr: number | null;
  chargeAigue: number;
  /** Charge hebdomadaire moyenne sur l'historique disponible (max 4 semaines). */
  chargeChronique: number;
  minutes7j: number;
  matchs14j: number;
  joursDepuisMatch: number | null;
  joursDepuisEffort: number | null;
  facteurs: FacteurFatigue[];
}

const POIDS: Record<CleFacteur, number> = { acwr: 0.4, residuelle: 0.3, congestion: 0.2, vulnerabilite: 0.1 };
const JOUR = 86_400_000;

const borne = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const arrondi = (v: number, d = 2) => +v.toFixed(d);
const fr = (x: number, d = 1) => x.toFixed(d).replace(".", ",");

/** Pression (0-100) d'un ACWR : sous-charge = fatigue basse, sweet spot = normal, > 1,5 = surcharge. */
export function pressionAcwr(acwr: number): number {
  if (acwr < 0.5) return Math.round(10 + (acwr / 0.5) * 15);
  if (acwr < 0.8) return Math.round(25 + ((acwr - 0.5) / 0.3) * 20);
  if (acwr < 1.3) return Math.round(45 + ((acwr - 0.8) / 0.5) * 20);
  if (acwr < 1.5) return Math.round(65 + ((acwr - 1.3) / 0.2) * 15);
  return Math.min(95, Math.round(80 + Math.min(15, (acwr - 1.5) * 30)));
}

export function niveauDe(score: number): NiveauFatigue {
  if (score < 35) return "frais";
  if (score < 55) return "normal";
  if (score < 75) return "charge";
  return "surcharge";
}

function resultatVide(raison: "indisponible" | "aucune_donnee", fiabilite: "solide" | "partielle" = "partielle"): ResultatFatigue {
  return {
    score: null, niveau: null, raison, fiabilite, acwr: null, chargeAigue: 0, chargeChronique: 0,
    minutes7j: 0, matchs14j: 0, joursDepuisMatch: null, joursDepuisEffort: null, facteurs: [],
  };
}

export function calculerFatigue(entree: EntreeFatigue): ResultatFatigue {
  if (entree.indisponible) return resultatVide("indisponible");

  // Efforts passes des 28 derniers jours (fenetres [0, 28[ et [0, 7[ : un effort d'il y a pile 7 jours
  // appartient a la semaine d'avant), avec leur anciennete en jours.
  const passes = entree.efforts
    .map((e) => ({ ...e, age: (entree.aujourdhui.getTime() - e.date.getTime()) / JOUR }))
    .filter((e) => e.age >= 0 && e.age < FENETRE_CHRONIQUE && e.ua > 0);
  if (passes.length === 0) return resultatVide("aucune_donnee");

  // -- 1. Charge relative (ACWR) --------------------------------------------------------------
  const chargeAigue = passes.filter((e) => e.age < FENETRE_AIGUE).reduce((s, e) => s + e.ua, 0);
  const total28 = passes.reduce((s, e) => s + e.ua, 0);
  // Historique reellement observe : un joueur qui ne s'entraine que depuis 10 jours n'a pas 4 semaines
  // de reference (sinon sa premiere semaine ressemblerait a une surcharge).
  const historiqueJours = Math.max(...passes.map((e) => e.age));
  const semaines = borne(Math.ceil(historiqueJours / 7), 1, 4);
  const chargeChronique = total28 / semaines;
  const acwr: number | null = semaines >= 2 && chargeChronique > 0 ? arrondi(chargeAigue / chargeChronique) : null;
  const pAcwr = acwr === null ? 50 : pressionAcwr(acwr);

  // -- 2. Charge residuelle (72 h) ------------------------------------------------------------
  const residuelle = passes.filter((e) => e.age < 5).reduce((s, e) => s + e.ua * Math.exp(-e.age / DEMI_VIE_RESIDUELLE), 0);
  const pResiduelle = Math.round(borne((residuelle / ECHELLE_RESIDUELLE) * 100, 0, 100));

  // -- 3. Congestion de matchs ----------------------------------------------------------------
  const matchs = passes.filter((e) => e.source === "match" && (e.minutes ?? 0) > 0);
  const minutes7j = matchs.filter((e) => e.age < 7).reduce((s, e) => s + (e.minutes ?? 0), 0);
  const minutes14j = matchs.filter((e) => e.age < 14).reduce((s, e) => s + (e.minutes ?? 0), 0);
  const matchs14j = matchs.filter((e) => e.age < 14).length;
  const pCongestion = Math.round(borne((minutes7j / 90) * 50 + (Math.max(0, minutes14j - minutes7j) / 90) * 20, 0, 100));

  // -- 4. Vulnerabilite -----------------------------------------------------------------------
  const retourRecent = !!entree.finDerniereBlessure
    && (entree.aujourdhui.getTime() - entree.finDerniereBlessure.getTime()) / JOUR <= 14
    && entree.finDerniereBlessure.getTime() <= entree.aujourdhui.getTime();
  const pAge = entree.age && entree.age >= 35 ? 20 : entree.age && entree.age >= 30 ? 10 : 0;
  const pVulnerabilite = Math.round(borne(
    Math.min(60, entree.blessuresAnt * 20) + (entree.enReprise || retourRecent ? 40 : 0) + pAge, 0, 100,
  ));

  const facteurs: FacteurFatigue[] = ([
    {
      cle: "acwr", libelle: "Charge de la semaine", pression: pAcwr,
      detail: acwr === null
        ? "Historique trop court (moins de 2 semaines) : charge relative non mesurable."
        : `${fr(acwr, 2)} fois la charge hebdomadaire moyenne (${Math.round(chargeAigue)} UA cette semaine, ${Math.round(chargeChronique)} en moyenne).`,
    },
    {
      cle: "residuelle", libelle: "Efforts des derniers jours", pression: pResiduelle,
      detail: residuelle < 20
        ? "Aucun effort marquant dans les 3 derniers jours."
        : `${Math.round(residuelle)} UA encore dans les jambes (seances et matchs des 3 a 5 derniers jours).`,
    },
    {
      cle: "congestion", libelle: "Matchs recents", pression: pCongestion,
      detail: matchs14j === 0
        ? "Aucun match joue ces 14 derniers jours."
        : `${matchs14j} match${matchs14j > 1 ? "s" : ""} en 14 jours, ${minutes7j} minute${minutes7j > 1 ? "s" : ""} sur les 7 derniers jours.`,
    },
    {
      cle: "vulnerabilite", libelle: "Vulnerabilite", pression: pVulnerabilite,
      detail: [
        entree.blessuresAnt > 0 ? `${entree.blessuresAnt} blessure${entree.blessuresAnt > 1 ? "s" : ""} anterieure${entree.blessuresAnt > 1 ? "s" : ""}` : null,
        entree.enReprise || retourRecent ? "retour de blessure recent" : null,
        pAge > 0 ? `${entree.age} ans` : null,
      ].filter(Boolean).join(", ") || "Aucun antecedent connu.",
    },
  ] as const).map((f) => ({ ...f, poids: POIDS[f.cle], points: arrondi(f.pression * POIDS[f.cle], 1) }));

  const score = Math.round(borne(facteurs.reduce((s, f) => s + f.points, 0), 0, 100));

  const dernierMatch = matchs.length ? Math.min(...matchs.map((e) => e.age)) : null;
  const dernierEffort = Math.min(...passes.map((e) => e.age));
  const aSeances = passes.some((e) => e.source === "entrainement");

  return {
    score,
    niveau: niveauDe(score),
    raison: null,
    fiabilite: entree.sources === "complet" && aSeances && semaines >= 2 ? "solide" : "partielle",
    acwr,
    chargeAigue: Math.round(chargeAigue),
    chargeChronique: Math.round(chargeChronique),
    minutes7j,
    matchs14j,
    joursDepuisMatch: dernierMatch === null ? null : arrondi(dernierMatch, 1),
    joursDepuisEffort: arrondi(dernierEffort, 1),
    facteurs,
  };
}

/** Facteurs tries du plus lourd au plus leger (ceux qui font monter la fatigue d'abord). */
export function facteursPrincipaux(r: ResultatFatigue, max = 3): FacteurFatigue[] {
  return [...r.facteurs].sort((a, b) => b.points - a.points).slice(0, max);
}

/* --------------------------------------------------------------------------------------------- */
/*  Persistance : on stocke les ENTREES (efforts des 28 derniers jours, statut, antecedents), pas    */
/*  seulement le score. La fatigue depend de la date du jour : elle est recalculee a chaque lecture  */
/*  (voir Joueur.rafraichirFatigue) et ne reste donc jamais figee sur le jour du dernier import.     */
/* --------------------------------------------------------------------------------------------- */

type EffortStocke = [string, number, "m" | "e", number];

interface EntreeStockee {
  v: 1;
  /** [date ISO, UA, "m" match | "e" entrainement, minutes]. */
  e: EffortStocke[];
  ind: boolean;
  rep: boolean;
  ant: number;
  fin: string | null;
  age: number | null;
  src: "complet" | "matchs";
}

/** Entree serialisable : seuls les efforts encore dans la fenetre de 28 jours sont gardes. */
export function serialiserEntree(entree: EntreeFatigue): string {
  const limite = entree.aujourdhui.getTime() - FENETRE_CHRONIQUE * JOUR;
  const stocke: EntreeStockee = {
    v: 1,
    e: entree.efforts
      .filter((e) => e.date.getTime() > limite && e.date.getTime() <= entree.aujourdhui.getTime() && e.ua > 0)
      .map((e): EffortStocke => [e.date.toISOString(), Math.round(e.ua * 10) / 10, e.source === "match" ? "m" : "e", e.minutes ?? 0]),
    ind: entree.indisponible,
    rep: entree.enReprise,
    ant: entree.blessuresAnt,
    fin: entree.finDerniereBlessure ? entree.finDerniereBlessure.toISOString() : null,
    age: entree.age ?? null,
    src: entree.sources,
  };
  return JSON.stringify(stocke);
}

/** Relit une entree stockee ; null si le JSON est absent, casse ou d'une autre version. */
export function deserialiserEntree(json: string | null | undefined, aujourdhui: Date): EntreeFatigue | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as EntreeStockee;
    if (s?.v !== 1 || !Array.isArray(s.e)) return null;
    return {
      aujourdhui,
      efforts: s.e.map(([date, ua, src, minutes]): Effort => ({
        date: new Date(date), ua, source: src === "m" ? "match" : "entrainement", minutes: minutes || undefined,
      })),
      indisponible: !!s.ind, enReprise: !!s.rep, blessuresAnt: s.ant ?? 0,
      finDerniereBlessure: s.fin ? new Date(s.fin) : null,
      age: s.age ?? null,
      sources: s.src === "matchs" ? "matchs" : "complet",
    };
  } catch {
    return null;
  }
}

/** Detail compact stocke / servi au front : tout ce qu'il faut pour expliquer le score, rien de plus. */
export function detailFatigue(r: ResultatFatigue, aujourdhui: Date) {
  return {
    niveau: r.niveau,
    raison: r.raison,
    fiabilite: r.fiabilite,
    minutes7j: r.minutes7j,
    matchs14j: r.matchs14j,
    joursDepuisMatch: r.joursDepuisMatch,
    joursDepuisEffort: r.joursDepuisEffort,
    facteurs: r.facteurs.map((f) => ({ cle: f.cle, libelle: f.libelle, pression: f.pression, poids: f.poids, points: f.points, detail: f.detail })),
    calculeLe: aujourdhui.toISOString(),
  };
}

/** Champs de fatigue d'un joueur, prets a etre poses sur l'entite. */
export function champsFatigue(entree: EntreeFatigue) {
  const r = calculerFatigue(entree);
  return {
    scoreFatigue: r.score,
    acwr: r.acwr,
    chargeAcute7j: r.score === null ? null : r.chargeAigue,
    chargeChronic28j: r.score === null ? null : r.chargeChronique,
    fatigueDetail: JSON.stringify(detailFatigue(r, entree.aujourdhui)),
    fatigueEntree: serialiserEntree(entree),
  };
}
