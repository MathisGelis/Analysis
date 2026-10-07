// src/features/analyse/tendances.ts
//
// Tendances d'une equipe sur une suite de matchs : dynamique recente contre le
// reste de la saison, series en cours, domicile / exterieur, profil des scores,
// discipline, rotation du onze, niveau des adversaires. Fonctions pures : aucune
// base, aucune horloge ; le service les alimente et les teste sur des matchs fictifs.
//
// Regle d'or : on ne tire aucune conclusion d'un echantillon trop petit. Chaque
// mesure declare son seuil (MIN_*) et retombe sur "insuffisant" en dessous.

import { parseDateFlexible, trierChronologiquement } from "@/common/dates";

export type Issue = "V" | "N" | "D";

/** Un match vu du point de vue de l'equipe analysee. */
export interface MatchTendance {
  matchId: string;
  date: string | null;
  journee: string | null;
  domicile: boolean;
  adversaireId: string | null;
  /** Equipe adverse (rang au classement) ; null si le match n'est pas rattache a une equipe. */
  adversaireEquipeId?: string | null;
  bp: number;
  bc: number;
  cartonsJaunes: number;
  cartonsRouges: number;
  minutesCartons: number[];
  /** Minutes des buts marques / encaisses, quand la feuille les donne (souvent vide). */
  minutesButsPour: number[];
  minutesButsContre: number[];
  /** Cles des titulaires (nom prenom normalises) ; null si la feuille n'a pas de composition. */
  titulaires: string[] | null;
}

/** Seuils : en dessous, pas de tendance. */
export const MIN_MATCHS_TENDANCE = 6;
export const MIN_MATCHS_LIEU = 3;
export const MIN_MATCHS_PROFIL = 5;
export const MIN_MATCHS_NIVEAU = 2;

const arrondi = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const moyenne = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const borne = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const issueDe = (bp: number, bc: number): Issue => (bp > bc ? "V" : bp === bc ? "N" : "D");
export const pointsDe = (i: Issue): number => (i === "V" ? 3 : i === "N" ? 1 : 0);

/* ---------------------------------- Bilans --------------------------------- */

export interface Bilan {
  joues: number; v: number; n: number; d: number;
  pts: number; ppm: number;
  bp: number; bc: number; bpm: number; bcm: number;
}

export function bilan(matchs: Pick<MatchTendance, "bp" | "bc">[]): Bilan {
  let v = 0, n = 0, d = 0, bp = 0, bc = 0;
  for (const m of matchs) {
    const i = issueDe(m.bp, m.bc);
    if (i === "V") v++; else if (i === "N") n++; else d++;
    bp += m.bp; bc += m.bc;
  }
  const joues = matchs.length;
  const pts = 3 * v + n;
  return {
    joues, v, n, d, pts, ppm: joues ? arrondi(pts / joues) : 0,
    bp, bc, bpm: joues ? arrondi(bp / joues) : 0, bcm: joues ? arrondi(bc / joues) : 0,
  };
}

/* ------------------------------- Courbe de forme ---------------------------- */

export interface PointCourbe {
  matchId: string; journee: string | null; date: string | null;
  issue: Issue; domicile: boolean; bp: number; bc: number; adversaireId: string | null;
  ptsCumules: number;
  /** Points par match sur les 5 derniers matchs (moins s'il y en a moins). */
  ppmGlissant: number;
  bpGlissant: number;
  bcGlissant: number;
}

export function courbeForme(matchs: MatchTendance[], fenetre = 5): PointCourbe[] {
  let cumul = 0;
  return matchs.map((m, i) => {
    const issue = issueDe(m.bp, m.bc);
    cumul += pointsDe(issue);
    const f = matchs.slice(Math.max(0, i - fenetre + 1), i + 1);
    const b = bilan(f);
    return {
      matchId: m.matchId, journee: m.journee, date: m.date, issue, domicile: m.domicile,
      bp: m.bp, bc: m.bc, adversaireId: m.adversaireId,
      ptsCumules: cumul, ppmGlissant: b.ppm, bpGlissant: b.bpm, bcGlissant: b.bcm,
    };
  });
}

/* ------------------------ Dynamique : recent contre avant ------------------- */

export type SensTendance = "hausse" | "baisse" | "stable" | "insuffisant";

export interface DynamiqueForme {
  /** Nombre de matchs de la fenetre recente (0 si l'echantillon est insuffisant). */
  fenetre: number;
  saison: Bilan;
  recente: Bilan;
  avant: Bilan;
  sens: SensTendance;
  ecartPpm: number;
  ecartBpm: number;
  ecartBcm: number;
  /** Sens de l'attaque et de la defense, mesures de la meme facon. */
  attaque: SensTendance;
  defense: SensTendance;
  /** 0-100 : niveau de forme actuel ET direction, pour un coup d'oeil. */
  score: number | null;
  libelle: string;
}

const SEUIL_PPM = 0.5;
const SEUIL_BUTS = 0.4;

const sensDe = (ecart: number, seuil: number, inverse = false): SensTendance => {
  const e = inverse ? -ecart : ecart;
  return e >= seuil ? "hausse" : e <= -seuil ? "baisse" : "stable";
};

/** Taille de la fenetre recente : 5 matchs, ou moins quand la saison est courte (au moins 3). */
export function tailleFenetre(n: number): number {
  return n >= 10 ? 5 : Math.max(3, Math.floor(n / 2));
}

export function dynamiqueForme(matchs: MatchTendance[]): DynamiqueForme {
  const saison = bilan(matchs);
  if (matchs.length < MIN_MATCHS_TENDANCE) {
    return {
      fenetre: 0, saison, recente: saison, avant: bilan([]), sens: "insuffisant",
      ecartPpm: 0, ecartBpm: 0, ecartBcm: 0, attaque: "insuffisant", defense: "insuffisant",
      score: null, libelle: "Pas assez de matchs",
    };
  }
  const k = tailleFenetre(matchs.length);
  const recente = bilan(matchs.slice(-k));
  const avant = bilan(matchs.slice(0, -k));
  const ecartPpm = arrondi(recente.ppm - avant.ppm);
  const ecartBpm = arrondi(recente.bpm - avant.bpm);
  const ecartBcm = arrondi(recente.bcm - avant.bcm);
  // Niveau (60 %) et direction (40 %) : une equipe a 2,4 pts/match qui recule reste haute.
  const score = Math.round(100 * (
    0.6 * (recente.ppm / 3) + 0.4 * ((borne(ecartPpm, -1.5, 1.5) + 1.5) / 3)
  ));
  const libelle = score >= 70 ? "Tres bonne dynamique" : score >= 55 ? "Bonne dynamique"
    : score >= 40 ? "Dynamique neutre" : score >= 25 ? "En difficulte" : "En crise";
  return {
    fenetre: k, saison, recente, avant,
    sens: sensDe(ecartPpm, SEUIL_PPM),
    ecartPpm, ecartBpm, ecartBcm,
    attaque: sensDe(ecartBpm, SEUIL_BUTS),
    defense: sensDe(ecartBcm, SEUIL_BUTS, true),      // encaisser moins = hausse
    score, libelle,
  };
}

/* ---------------------------------- Series --------------------------------- */

export type TypeSerie =
  | "victoires" | "invaincu" | "defaites" | "sans_victoire" | "sans_encaisser" | "sans_marquer" | "marque";

const CONDITIONS: Record<TypeSerie, (m: MatchTendance) => boolean> = {
  victoires: (m) => m.bp > m.bc,
  invaincu: (m) => m.bp >= m.bc,
  defaites: (m) => m.bp < m.bc,
  sans_victoire: (m) => m.bp <= m.bc,
  sans_encaisser: (m) => m.bc === 0,
  sans_marquer: (m) => m.bp === 0,
  marque: (m) => m.bp > 0,
};

export interface Serie { type: TypeSerie; longueur: number }

export interface Series {
  /** Series encore ouvertes au dernier match (au moins 2 matchs), les plus longues d'abord ; "marque" en dernier. */
  enCours: Serie[];
  /** Record de la saison pour chaque type de serie. */
  records: Serie[];
}

export function series(matchs: MatchTendance[]): Series {
  const types = Object.keys(CONDITIONS) as TypeSerie[];
  const enCours: Serie[] = [];
  const records: Serie[] = [];
  for (const type of types) {
    const ok = CONDITIONS[type];
    let courante = 0, record = 0;
    for (const m of matchs) {
      courante = ok(m) ? courante + 1 : 0;
      record = Math.max(record, courante);
    }
    if (courante >= 2) enCours.push({ type, longueur: courante });
    records.push({ type, longueur: record });
  }
  // "invaincu" contient "victoires" (meme chose en plus large) : on garde la plus parlante.
  const filtrees = enCours.filter((s) => !(
    (s.type === "invaincu" && enCours.some((x) => x.type === "victoires" && x.longueur === s.longueur))
    || (s.type === "sans_victoire" && enCours.some((x) => x.type === "defaites" && x.longueur === s.longueur))
  ));
  // Les plus longues d'abord ; marquer a chaque match est banal, cette serie passe apres les autres.
  const banale = (s: Serie) => (s.type === "marque" ? 1 : 0);
  return { enCours: filtrees.sort((a, b) => banale(a) - banale(b) || b.longueur - a.longueur), records };
}

/* ------------------------------- Lieux et profil ---------------------------- */

export interface Lieux {
  domicile: Bilan;
  exterieur: Bilan;
  /** Ecart de points par match domicile - exterieur ; null si l'un des deux manque de matchs. */
  ecartPpm: number | null;
}

export function lieux(matchs: MatchTendance[]): Lieux {
  const domicile = bilan(matchs.filter((m) => m.domicile));
  const exterieur = bilan(matchs.filter((m) => !m.domicile));
  const assez = domicile.joues >= MIN_MATCHS_LIEU && exterieur.joues >= MIN_MATCHS_LIEU;
  return { domicile, exterieur, ecartPpm: assez ? arrondi(domicile.ppm - exterieur.ppm) : null };
}

export interface ProfilScores {
  matchs: number;
  matchsSansEncaisser: number;
  matchsSansMarquer: number;
  /** Matchs decides par un but d'ecart au plus. */
  matchsSerres: number;
  recordMatchsSerres: Bilan;
  grossesVictoires: number;      // 3 buts d'ecart ou plus
  grossesDefaites: number;
}

export function profilScores(matchs: MatchTendance[]): ProfilScores {
  const serres = matchs.filter((m) => Math.abs(m.bp - m.bc) <= 1);
  return {
    matchs: matchs.length,
    matchsSansEncaisser: matchs.filter((m) => m.bc === 0).length,
    matchsSansMarquer: matchs.filter((m) => m.bp === 0).length,
    matchsSerres: serres.length,
    recordMatchsSerres: bilan(serres),
    grossesVictoires: matchs.filter((m) => m.bp - m.bc >= 3).length,
    grossesDefaites: matchs.filter((m) => m.bc - m.bp >= 3).length,
  };
}

/* ------------------------------- Deux moities ------------------------------- */

export interface Moities { premiere: Bilan; seconde: Bilan; ecartPpm: number }

/** Premiere et seconde moitie des matchs joues ; null sous 8 matchs. */
export function moities(matchs: MatchTendance[]): Moities | null {
  if (matchs.length < 8) return null;
  const milieu = Math.floor(matchs.length / 2);
  const premiere = bilan(matchs.slice(0, milieu));
  const seconde = bilan(matchs.slice(milieu));
  return { premiere, seconde, ecartPpm: arrondi(seconde.ppm - premiere.ppm) };
}

/* -------------------------------- Discipline -------------------------------- */

const tranche = (minute: number) => borne(Math.floor((Math.max(1, minute) - 1) / 15), 0, 5);

export interface Discipline {
  jaunes: number;
  rouges: number;
  jaunesParMatch: number;
  recentJaunesParMatch: number;
  avantJaunesParMatch: number;
  ecartJaunes: number;
  /** Cartons par tranche de 15 minutes (minutes connues seulement). */
  parTranche: number[];
  cartonsAvecMinute: number;
  /** Part des cartons recus apres la 75e minute (0-1) ; null sans minute. */
  partFinDeMatch: number | null;
}

export function discipline(matchs: MatchTendance[]): Discipline {
  const jaunes = matchs.reduce((s, m) => s + m.cartonsJaunes, 0);
  const rouges = matchs.reduce((s, m) => s + m.cartonsRouges, 0);
  const k = matchs.length >= MIN_MATCHS_TENDANCE ? tailleFenetre(matchs.length) : 0;
  const recents = k ? matchs.slice(-k) : [];
  const avant = k ? matchs.slice(0, -k) : [];
  const parMatch = (ms: MatchTendance[]) => (ms.length ? ms.reduce((s, m) => s + m.cartonsJaunes, 0) / ms.length : 0);
  const parTranche = [0, 0, 0, 0, 0, 0];
  let avecMinute = 0;
  for (const m of matchs) for (const mn of m.minutesCartons) { parTranche[tranche(mn)]++; avecMinute++; }
  return {
    jaunes, rouges,
    jaunesParMatch: arrondi(parMatch(matchs)),
    recentJaunesParMatch: arrondi(parMatch(recents)),
    avantJaunesParMatch: arrondi(parMatch(avant)),
    ecartJaunes: k ? arrondi(parMatch(recents) - parMatch(avant)) : 0,
    parTranche,
    cartonsAvecMinute: avecMinute,
    partFinDeMatch: avecMinute ? arrondi(parTranche[5] / avecMinute) : null,
  };
}

/* ------------------------------ Buts par tranche ---------------------------- */

export interface ButsParTranche {
  disponible: boolean;
  /** Part des buts dont la feuille donne la minute (0-1). */
  couverture: number;
  pour: number[];
  contre: number[];
}

/**
 * Repartition des buts par tranche de 15 minutes. Les feuilles FMI ne listent pas
 * toujours les buteurs : sous 60 % de buts dates (ou moins de 8 buts), on declare
 * la mesure indisponible plutot que de montrer une repartition fausse.
 */
export function butsParTranche(matchs: MatchTendance[]): ButsParTranche {
  const pour = [0, 0, 0, 0, 0, 0];
  const contre = [0, 0, 0, 0, 0, 0];
  let dates = 0, total = 0;
  for (const m of matchs) {
    total += m.bp + m.bc;
    for (const mn of m.minutesButsPour) { pour[tranche(mn)]++; dates++; }
    for (const mn of m.minutesButsContre) { contre[tranche(mn)]++; dates++; }
  }
  const couverture = total ? arrondi(dates / total) : 0;
  return { disponible: total >= 8 && couverture >= 0.6, couverture, pour, contre };
}

/* ---------------------------------- Rotation -------------------------------- */

export interface Rotation {
  /** Titulaires differents du match precedent, pour chaque match (le 1er n'en a pas). */
  changements: (number | null)[];
  moyenne: number;
  recente: number;
  avant: number;
  sens: SensTendance;     // "hausse" = le onze bouge de plus en plus
}

export function rotation(matchs: MatchTendance[]): Rotation {
  const changements: (number | null)[] = [];
  let prec: string[] | null = null;
  for (const m of matchs) {
    if (m.titulaires && prec && m.titulaires.length && prec.length) {
      const avant = new Set(prec);
      changements.push(m.titulaires.filter((t) => !avant.has(t)).length);
    } else changements.push(null);
    if (m.titulaires && m.titulaires.length) prec = m.titulaires;
  }
  const valeurs = changements.filter((c): c is number => c !== null);
  const k = valeurs.length >= MIN_MATCHS_TENDANCE - 1 ? tailleFenetre(valeurs.length) : 0;
  const recente = k ? moyenne(valeurs.slice(-k)) : 0;
  const avant = k ? moyenne(valeurs.slice(0, -k)) : 0;
  return {
    changements,
    moyenne: arrondi(moyenne(valeurs), 1),
    recente: arrondi(recente, 1),
    avant: arrondi(avant, 1),
    sens: !k ? "insuffisant" : sensDe(recente - avant, 1.5),
  };
}

/* ------------------------------ Niveau des adversaires ---------------------- */

export type NiveauAdversaire = "haut" | "milieu" | "bas";

export interface ParNiveau {
  niveau: NiveauAdversaire;
  /** Bornes de rang, ex. "1-4" ; vide si la poule est trop petite. */
  rangs: string;
  bilan: Bilan;
}

/**
 * Resultats contre le haut, le milieu et le bas du classement (tiers de la poule).
 * `rangDe` donne le rang de l'adversaire ; null = inconnu, le match est ignore.
 */
export function parNiveauAdversaire(
  matchs: MatchTendance[], rangDe: (m: MatchTendance) => number | null, nbEquipes: number,
): ParNiveau[] | null {
  if (nbEquipes < 6) return null;
  const tiers = Math.floor(nbEquipes / 3);
  const groupes: Record<NiveauAdversaire, MatchTendance[]> = { haut: [], milieu: [], bas: [] };
  for (const m of matchs) {
    const r = rangDe(m);
    if (r == null) continue;
    groupes[r <= tiers ? "haut" : r > nbEquipes - tiers ? "bas" : "milieu"].push(m);
  }
  if (Object.values(groupes).reduce((s, g) => s + g.length, 0) < MIN_MATCHS_PROFIL) return null;
  return [
    { niveau: "haut", rangs: `1-${tiers}`, bilan: bilan(groupes.haut) },
    { niveau: "milieu", rangs: `${tiers + 1}-${nbEquipes - tiers}`, bilan: bilan(groupes.milieu) },
    { niveau: "bas", rangs: `${nbEquipes - tiers + 1}-${nbEquipes}`, bilan: bilan(groupes.bas) },
  ];
}

/* ----------------------------------- Tout ---------------------------------- */

export interface Tendances {
  matchs: number;
  courbe: PointCourbe[];
  forme: DynamiqueForme;
  series: Series;
  lieux: Lieux;
  profil: ProfilScores;
  moities: Moities | null;
  discipline: Discipline;
  butsParTranche: ButsParTranche;
  rotation: Rotation;
  parNiveau: ParNiveau[] | null;
  insights: Insight[];
}

export function calculerTendances(
  matchsDesordonnes: MatchTendance[],
  contexte: { rangDe?: (m: MatchTendance) => number | null; nbEquipes?: number } = {},
): Tendances {
  const matchs = trierChronologiquement(matchsDesordonnes);
  const t = {
    matchs: matchs.length,
    courbe: courbeForme(matchs),
    forme: dynamiqueForme(matchs),
    series: series(matchs),
    lieux: lieux(matchs),
    profil: profilScores(matchs),
    moities: moities(matchs),
    discipline: discipline(matchs),
    butsParTranche: butsParTranche(matchs),
    rotation: rotation(matchs),
    parNiveau: contexte.rangDe && contexte.nbEquipes
      ? parNiveauAdversaire(matchs, contexte.rangDe, contexte.nbEquipes) : null,
  };
  return { ...t, insights: genererInsights(t) };
}

/* --------------------------------- Insights --------------------------------- */

export type TonInsight = "positif" | "negatif" | "neutre";
export type CategorieInsight = "forme" | "attaque" | "defense" | "domicile" | "discipline" | "effectif" | "adversaires";

export interface Insight {
  id: string;
  ton: TonInsight;
  categorie: CategorieInsight;
  /** 3 = a lire en premier. */
  importance: 1 | 2 | 3;
  titre: string;
  detail: string;
}

const fr = (x: number, d = 1) => x.toFixed(d).replace(".", ",");
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
/** Quantite decimale accordee : "1,8 but marque", "2,0 buts marques" (le pluriel commence a 2). */
const quant = (x: number, singulier: string, plur: string) => `${fr(x)} ${x >= 2 ? plur : singulier}`;

const LIBELLE_SERIE: Record<TypeSerie, (n: number) => string> = {
  victoires: (n) => `${n} victoires de suite`,
  invaincu: (n) => `${n} matchs sans defaite`,
  defaites: (n) => `${n} defaites de suite`,
  sans_victoire: (n) => `${n} matchs sans victoire`,
  sans_encaisser: (n) => `${n} matchs sans encaisser`,
  sans_marquer: (n) => `${n} matchs sans marquer`,
  marque: (n) => `un but marque a chacun des ${n} derniers matchs`,
};

/**
 * Constats ecrits en francais, tries par importance. Chaque phrase s'appuie sur
 * des chiffres montres a cote ; aucune n'est emise sous le seuil d'echantillon.
 */
export function genererInsights(t: Omit<Tendances, "insights">): Insight[] {
  const out: Insight[] = [];
  const add = (i: Insight) => out.push(i);
  const { forme, lieux: l, profil: p, discipline: d } = t;

  /* Dynamique */
  if (forme.sens !== "insuffisant") {
    const r = forme.recente, a = forme.avant;
    if (forme.sens === "hausse") {
      add({ id: "forme-hausse", ton: "positif", categorie: "forme", importance: 3,
        titre: "Dynamique en hausse",
        detail: `${r.pts} points sur les ${forme.fenetre} derniers matchs (${fr(r.ppm)} par match) contre ${fr(a.ppm)} auparavant.` });
    } else if (forme.sens === "baisse") {
      add({ id: "forme-baisse", ton: "negatif", categorie: "forme", importance: 3,
        titre: "Dynamique en baisse",
        detail: `${r.pts} points sur les ${forme.fenetre} derniers matchs (${fr(r.ppm)} par match) contre ${fr(a.ppm)} auparavant.` });
    }
    if (forme.attaque === "hausse") {
      add({ id: "attaque-hausse", ton: "positif", categorie: "attaque", importance: 2,
        titre: "L'attaque se libere", detail: `${quant(r.bpm, "but marque", "buts marques")} par match recemment, contre ${fr(a.bpm)} avant.` });
    } else if (forme.attaque === "baisse") {
      add({ id: "attaque-baisse", ton: "negatif", categorie: "attaque", importance: 2,
        titre: "L'attaque s'essouffle", detail: `${quant(r.bpm, "but marque", "buts marques")} par match recemment, contre ${fr(a.bpm)} avant.` });
    }
    if (forme.defense === "hausse") {
      add({ id: "defense-hausse", ton: "positif", categorie: "defense", importance: 2,
        titre: "La defense se resserre", detail: `${quant(r.bcm, "but encaisse", "buts encaisses")} par match recemment, contre ${fr(a.bcm)} avant.` });
    } else if (forme.defense === "baisse") {
      add({ id: "defense-baisse", ton: "negatif", categorie: "defense", importance: 2,
        titre: "La defense se fragilise", detail: `${quant(r.bcm, "but encaisse", "buts encaisses")} par match recemment, contre ${fr(a.bcm)} avant.` });
    }
  }

  /* Series en cours (pas avant 5 matchs : trois victoires en trois matchs, c'est le debut de saison) */
  for (const s of t.matchs >= MIN_MATCHS_PROFIL ? t.series.enCours.slice(0, 2) : []) {
    const positive = s.type === "victoires" || s.type === "invaincu" || s.type === "sans_encaisser" || s.type === "marque";
    const seuil = s.type === "victoires" ? 3 : s.type === "invaincu" ? 4 : s.type === "marque" ? 6 : 3;
    if (s.longueur < seuil) continue;
    add({ id: `serie-${s.type}`, ton: positive ? "positif" : "negatif", categorie: s.type === "sans_marquer" || s.type === "marque" ? "attaque" : s.type === "sans_encaisser" ? "defense" : "forme",
      importance: s.longueur >= 5 ? 3 : 2, titre: `Serie en cours : ${LIBELLE_SERIE[s.type](s.longueur)}`,
      detail: `Record de la saison : ${t.series.records.find((r) => r.type === s.type)?.longueur ?? s.longueur}.` });
  }

  /* Domicile / exterieur */
  if (l.ecartPpm !== null && Math.abs(l.ecartPpm) >= 1) {
    const dom = l.ecartPpm > 0;
    add({ id: "lieux-ecart", ton: "neutre", categorie: "domicile", importance: 2,
      titre: dom ? "Bien plus fort a domicile" : "Plus a l'aise a l'exterieur",
      detail: `${fr(l.domicile.ppm)} pt/match a domicile (${pluriel(l.domicile.joues, "match")}) contre ${fr(l.exterieur.ppm)} a l'exterieur (${pluriel(l.exterieur.joues, "match")}).` });
  }
  if (l.exterieur.joues >= MIN_MATCHS_LIEU && l.exterieur.bcm >= 2) {
    add({ id: "defense-exterieur", ton: "negatif", categorie: "defense", importance: 2,
      titre: "Fragile en deplacement", detail: `${fr(l.exterieur.bcm)} buts encaisses par match a l'exterieur.` });
  }

  /* Profil des scores */
  if (p.matchs >= MIN_MATCHS_PROFIL) {
    const taux = (x: number) => Math.round((x / p.matchs) * 100);
    if (p.matchsSansEncaisser / p.matchs >= 0.4) {
      add({ id: "profil-solide", ton: "positif", categorie: "defense", importance: 2,
        titre: "Defense solide", detail: `${pluriel(p.matchsSansEncaisser, "match")} sans encaisser (${taux(p.matchsSansEncaisser)} %).` });
    }
    if (p.matchsSansMarquer / p.matchs >= 0.3) {
      add({ id: "profil-muet", ton: "negatif", categorie: "attaque", importance: 2,
        titre: "Attaque parfois muette", detail: `${pluriel(p.matchsSansMarquer, "match")} sans marquer (${taux(p.matchsSansMarquer)} %).` });
    }
    const rs = p.recordMatchsSerres;
    if (p.matchsSerres / p.matchs >= 0.4 && rs.joues >= 4) {
      add({ id: "profil-serres", ton: rs.ppm >= 1.8 ? "positif" : rs.ppm <= 1 ? "negatif" : "neutre", categorie: "forme", importance: 1,
        titre: "Beaucoup de matchs serres",
        detail: `${p.matchsSerres} matchs sur ${p.matchs} se jouent a un but : ${rs.v}V ${rs.n}N ${rs.d}D dans ces matchs (${fr(rs.ppm)} pt/match)${rs.ppm >= 1.8 ? ", reussite a confirmer" : ""}.` });
    }
    if (p.grossesDefaites >= 2) {
      add({ id: "profil-grosses-defaites", ton: "negatif", categorie: "defense", importance: 2,
        titre: "Des defaites lourdes", detail: `${pluriel(p.grossesDefaites, "defaite")} avec 3 buts d'ecart ou plus.` });
    }
  }

  /* Deux moities de saison */
  if (t.moities && Math.abs(t.moities.ecartPpm) >= 0.6) {
    const hausse = t.moities.ecartPpm > 0;
    add({ id: "moities", ton: hausse ? "positif" : "negatif", categorie: "forme", importance: 1,
      titre: hausse ? "Meilleure seconde partie de saison" : "Seconde partie de saison plus difficile",
      detail: `${fr(t.moities.premiere.ppm)} pt/match sur la premiere moitie, ${fr(t.moities.seconde.ppm)} sur la seconde.` });
  }

  /* Niveau des adversaires */
  if (t.parNiveau) {
    const haut = t.parNiveau.find((n) => n.niveau === "haut")!.bilan;
    const bas = t.parNiveau.find((n) => n.niveau === "bas")!.bilan;
    if (bas.joues >= MIN_MATCHS_NIVEAU && bas.ppm < 1.5) {
      add({ id: "niveau-bas", ton: "negatif", categorie: "adversaires", importance: 2,
        titre: "Perd des points contre le bas du classement", detail: `${fr(bas.ppm)} pt/match contre les equipes du dernier tiers (${bas.v}V ${bas.n}N ${bas.d}D).` });
    }
    if (haut.joues >= MIN_MATCHS_NIVEAU && haut.ppm >= 1.6) {
      add({ id: "niveau-haut", ton: "positif", categorie: "adversaires", importance: 2,
        titre: "Tient tete aux meilleurs", detail: `${fr(haut.ppm)} pt/match contre le premier tiers du classement (${haut.v}V ${haut.n}N ${haut.d}D).` });
    } else if (haut.joues >= MIN_MATCHS_NIVEAU && haut.ppm < 0.7) {
      add({ id: "niveau-haut-faible", ton: "negatif", categorie: "adversaires", importance: 1,
        titre: "Cale contre les meilleurs", detail: `${fr(haut.ppm)} pt/match contre le premier tiers du classement.` });
    }
  }

  /* Discipline */
  if (d.rouges >= 2) {
    add({ id: "discipline-rouges", ton: "negatif", categorie: "discipline", importance: 2,
      titre: "Des expulsions a repetition", detail: `${pluriel(d.rouges, "carton rouge")} cette saison.` });
  }
  if (t.forme.sens !== "insuffisant" && d.ecartJaunes >= 0.7) {
    add({ id: "discipline-hausse", ton: "negatif", categorie: "discipline", importance: 2,
      titre: "Les cartons s'accumulent", detail: `${quant(d.recentJaunesParMatch, "jaune", "jaunes")} par match recemment, contre ${fr(d.avantJaunesParMatch)} avant.` });
  }
  if (d.partFinDeMatch !== null && d.cartonsAvecMinute >= 6 && d.partFinDeMatch >= 0.4) {
    add({ id: "discipline-fin", ton: "negatif", categorie: "discipline", importance: 1,
      titre: "Les cartons tombent en fin de match", detail: `${Math.round(d.partFinDeMatch * 100)} % des cartons apres la 75e minute : la fatigue coute des fautes.` });
  }

  /* Buts par tranche (si les feuilles les datent) */
  const b = t.butsParTranche;
  if (b.disponible) {
    const totalContre = b.contre.reduce((s, x) => s + x, 0);
    const totalPour = b.pour.reduce((s, x) => s + x, 0);
    if (totalContre >= 6 && (b.contre[0] + b.contre[5]) / totalContre >= 0.5) {
      add({ id: "buts-contre-bords", ton: "negatif", categorie: "defense", importance: 1,
        titre: "Encaisse aux extremites du match", detail: `${b.contre[0] + b.contre[5]} buts encaisses sur ${totalContre} tombent dans les 15 premieres ou 15 dernieres minutes.` });
    }
    if (totalPour >= 6 && (b.pour[3] + b.pour[4] + b.pour[5]) / totalPour >= 0.6) {
      add({ id: "buts-pour-fin", ton: "positif", categorie: "attaque", importance: 1,
        titre: "Finit fort", detail: `${b.pour[3] + b.pour[4] + b.pour[5]} buts marques sur ${totalPour} apres la 45e minute.` });
    }
  }

  /* Rotation */
  if (t.rotation.sens === "hausse") {
    add({ id: "rotation-hausse", ton: "negatif", categorie: "effectif", importance: 2,
      titre: "Le onze bouge de plus en plus", detail: `${quant(t.rotation.recente, "titulaire different", "titulaires differents")} d'un match a l'autre recemment, contre ${fr(t.rotation.avant)} avant.` });
  } else if (t.rotation.sens === "baisse") {
    add({ id: "rotation-baisse", ton: "positif", categorie: "effectif", importance: 1,
      titre: "Le onze se stabilise", detail: `${quant(t.rotation.recente, "changement", "changements")} par match recemment, contre ${fr(t.rotation.avant)} avant.` });
  }

  return out.sort((a, b2) => b2.importance - a.importance);
}
