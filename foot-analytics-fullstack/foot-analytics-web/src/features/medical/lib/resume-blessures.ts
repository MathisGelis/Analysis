// src/features/medical/lib/resume-blessures.ts
//
// RESUME DES BLESSURES D'UNE SAISON : ce que l'onglet Medical montre d'un coup d'oeil (combien, qui, ou, combien de temps,
// quand). Une saison va du 1er aout au 31 juillet ; une blessure appartient a la saison ou elle commence. Fonctions pures :
// toutes les dates sont lues et comparees en UTC, jamais dans le fuseau du navigateur.

import { blessureEnCours } from "./blessures";

const JOUR_MS = 86_400_000;

export interface BlessureSaison {
  id: string;
  joueurId: string;
  joueurNom?: string | null;
  localisation?: string | null;
  gravite?: string | null;
  dateDebut?: string | null;
  retourEstime?: string | null;
  statut?: string | null;
}

export interface FenetreSaison { debut: number; fin: number }

/** 1er aout N -> 31 juillet N+1 (ms UTC, a minuit : les dates des blessures sont des jours, pas des instants). */
export const fenetreSaison = (anneeDebut: number): FenetreSaison => ({
  debut: Date.UTC(anneeDebut, 7, 1), fin: Date.UTC(anneeDebut + 1, 6, 31),
});

/** "2025-09-12" (suite de l'heure ignoree) ou "12/09/2025" -> ms UTC a minuit ; null si illisible. */
export function lireJour(texte: string | null | undefined): number | null {
  const t = (texte ?? "").trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const fr = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (fr) return Date.UTC(+fr[3] < 100 ? 2000 + +fr[3] : +fr[3], +fr[2] - 1, +fr[1]);
  return null;
}

/**
 * Les blessures de la saison pour ces joueurs : celles dont la date de debut tombe dans la saison ; une blessure sans date
 * n'est retenue que sur la saison en cours (on ne sait pas la situer ailleurs).
 */
export function blessuresDeLaSaison<B extends BlessureSaison>(
  blessures: readonly B[], joueurIds: ReadonlySet<string>, fenetre: FenetreSaison, saisonEnCours: boolean,
): B[] {
  return blessures.filter((b) => {
    if (!joueurIds.has(b.joueurId)) return false;
    const debut = lireJour(b.dateDebut);
    return debut === null ? saisonEnCours : debut >= fenetre.debut && debut <= fenetre.fin;
  });
}

/** Jours d'indisponibilite DANS la saison : du debut au retour (ou, sans retour, a aujourd'hui), sans depasser la fin de saison. */
export function joursDansLaSaison(b: BlessureSaison, fenetre: FenetreSaison, maintenant: number): number {
  const debut = lireJour(b.dateDebut);
  if (debut === null) return 0;
  const retour = lireJour(b.retourEstime);
  const fin = Math.min(retour ?? maintenant, fenetre.fin);
  return Math.max(0, Math.round((fin - debut) / JOUR_MS));
}

export interface LigneRepartition { cle: string; libelle: string; n: number; jours: number }

export interface LigneJoueur { joueurId: string; nom: string; n: number; jours: number }

export interface ResumeBlessures {
  total: number;
  joueursTouches: number;
  /** Pas encore retablies (statut ou absence de date de retour). */
  enCours: number;
  retablies: number;
  /** Jours d'indisponibilite cumules sur la saison. */
  joursManques: number;
  /** Duree moyenne des blessures terminees (jours), null s'il n'y en a pas de datee. */
  dureeMoyenne: number | null;
  plusLongue: { joueurId: string; nom: string; localisation: string; jours: number } | null;
  parLocalisation: LigneRepartition[];
  parGravite: LigneRepartition[];
  /** Douze mois, d'aout a juillet. */
  parMois: { mois: string; libelle: string; n: number }[];
  parJoueur: LigneJoueur[];
  /** Un meme joueur blesse au moins deux fois au meme endroit. */
  rechutes: { joueurId: string; nom: string; localisation: string; n: number }[];
}

const MOIS_COURTS = ["janv.", "fevr.", "mars", "avr.", "mai", "juin", "juil.", "aout", "sept.", "oct.", "nov.", "dec."] as const;
const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const cle = (s: string | null | undefined) => sansAccent((s ?? "").trim().toLowerCase());
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function repartir(entrees: { cle: string; libelle: string; jours: number }[]): LigneRepartition[] {
  const par = new Map<string, LigneRepartition>();
  for (const e of entrees) {
    const l = par.get(e.cle) ?? par.set(e.cle, { cle: e.cle, libelle: e.libelle, n: 0, jours: 0 }).get(e.cle)!;
    l.n++; l.jours += e.jours;
  }
  return [...par.values()].sort((a, b) => b.n - a.n || b.jours - a.jours || a.libelle.localeCompare(b.libelle));
}

/**
 * Le resume. `noms` : nom d'affichage de chaque joueur (a defaut, celui saisi sur la blessure). `anneeDebut` : la saison,
 * pour les douze mois du graphique.
 */
export function resumerBlessures(
  blessures: readonly BlessureSaison[], anneeDebut: number, maintenant: number, noms: ReadonlyMap<string, string> = new Map(),
): ResumeBlessures {
  const fenetre = fenetreSaison(anneeDebut);
  const nomDe = (b: BlessureSaison) => noms.get(b.joueurId) ?? (b.joueurNom?.trim() || "Joueur inconnu");
  const avecJours = blessures.map((b) => ({ b, jours: joursDansLaSaison(b, fenetre, maintenant), enCours: blessureEnCours(b) }));

  const terminees = avecJours.filter((x) => !x.enCours && lireJour(x.b.dateDebut) !== null && lireJour(x.b.retourEstime) !== null);
  const plus = [...avecJours].sort((a, b) => b.jours - a.jours)[0];

  const parMois = Array.from({ length: 12 }, (_, i) => {
    const m = (7 + i) % 12;
    const annee = m >= 7 ? anneeDebut : anneeDebut + 1;
    return { mois: `${annee}-${String(m + 1).padStart(2, "0")}`, libelle: MOIS_COURTS[m], n: 0 };
  });
  for (const { b } of avecJours) {
    const d = lireJour(b.dateDebut);
    if (d === null) continue;
    const date = new Date(d);
    const mois = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const ligne = parMois.find((x) => x.mois === mois);
    if (ligne) ligne.n++;
  }

  const joueurs = new Map<string, LigneJoueur>();
  for (const { b, jours } of avecJours) {
    const l = joueurs.get(b.joueurId) ?? joueurs.set(b.joueurId, { joueurId: b.joueurId, nom: nomDe(b), n: 0, jours: 0 }).get(b.joueurId)!;
    l.n++; l.jours += jours;
  }

  const paires = new Map<string, { joueurId: string; nom: string; localisation: string; n: number }>();
  for (const { b } of avecJours) {
    if (!cle(b.localisation)) continue;
    const k = `${b.joueurId}|${cle(b.localisation)}`;
    const l = paires.get(k) ?? paires.set(k, { joueurId: b.joueurId, nom: nomDe(b), localisation: majuscule((b.localisation ?? "").trim()), n: 0 }).get(k)!;
    l.n++;
  }

  return {
    total: avecJours.length,
    joueursTouches: joueurs.size,
    enCours: avecJours.filter((x) => x.enCours).length,
    retablies: avecJours.filter((x) => !x.enCours).length,
    joursManques: avecJours.reduce((s, x) => s + x.jours, 0),
    dureeMoyenne: terminees.length ? Math.round(terminees.reduce((s, x) => s + x.jours, 0) / terminees.length) : null,
    plusLongue: plus && plus.jours > 0 ? { joueurId: plus.b.joueurId, nom: nomDe(plus.b), localisation: majuscule((plus.b.localisation ?? "").trim()) || "Non precisee", jours: plus.jours } : null,
    parLocalisation: repartir(avecJours.map(({ b, jours }) => ({ cle: cle(b.localisation) || "?", libelle: majuscule((b.localisation ?? "").trim()) || "Non precisee", jours }))),
    parGravite: repartir(avecJours.filter(({ b }) => cle(b.gravite)).map(({ b, jours }) => ({ cle: cle(b.gravite), libelle: majuscule((b.gravite ?? "").trim()), jours }))),
    parMois,
    parJoueur: [...joueurs.values()].sort((a, b) => b.n - a.n || b.jours - a.jours || a.nom.localeCompare(b.nom)),
    rechutes: [...paires.values()].filter((p) => p.n >= 2).sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom)),
  };
}
