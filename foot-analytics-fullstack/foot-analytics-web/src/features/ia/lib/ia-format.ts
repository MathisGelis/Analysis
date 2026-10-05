// src/features/ia/lib/ia-format.ts
//
// Mise en forme et lecture des resultats de l'IA pour l'ecran admin. Fonctions pures.

import type {
  Caracteristique, Decision, EntrainementResume, ErreurFeuille, Hyper, Mesure, Methode, NotesParMethode, PlanningIa, Poids, PointCourbe,
  ResultatEntrainement, StatutEntrainement,
} from "./ia-types";

const nf = (d: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** 0,8412 -> "84,1 %" ; absent -> "—". */
export function pct(x: number | null | undefined, decimales = 1): string {
  return typeof x === "number" ? `${nf(decimales).format(x * 100)} %` : "—";
}

/** Ecart de deux proportions, en points : 0,845 - 0,838 -> "+0,7 pt" ; absent -> "—". */
export function ecartPoints(a: number | null | undefined, b: number | null | undefined): string {
  if (typeof a !== "number" || typeof b !== "number") return "—";
  const d = (a - b) * 100;
  const signe = d > 0.05 ? "+" : d < -0.05 ? "-" : "";
  const abs = Math.abs(d);
  return `${signe}${nf(1).format(abs)} pt${abs >= 2 ? "s" : ""}`;
}

/** Un nombre a virgule francaise. */
export const nombre = (x: number | null | undefined, decimales = 2): string => (typeof x === "number" ? nf(decimales).format(x) : "—");

export const LIBELLE_METHODE: Readonly<Record<Methode, string>> = {
  modele: "Modele appris",
  dernier: "Meme onze que le dernier match",
  moteur: "Moteur a regles actuel",
  frequence: "Les 11 plus souvent titulaires",
};

export const LIBELLE_METHODE_COURT: Readonly<Record<Methode, string>> = {
  modele: "IA", dernier: "Dernier onze", moteur: "Moteur a regles", frequence: "Plus titulaires",
};

export const METHODES: readonly Methode[] = ["modele", "moteur", "dernier", "frequence"];

export const LIBELLE_STATUT: Readonly<Record<StatutEntrainement, string>> = {
  en_cours: "En cours", termine: "Termine", echec: "Echec", annule: "Annule",
};

/** Duree lisible : 4 s, 1 min 12 s, 2 h 05 min. */
export function dureeFr(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** Date et heure d'un horodatage ISO ("05/10/2026 14:32"). */
export function dateHeure(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "fenetre de 10 matchs, regularisation 0,3, oubli en 12 semaines". */
export function libelleHyper(h: Hyper): string {
  return `fenetre de ${h.fenetre} matchs, regularisation ${nombre(h.l2, h.l2 < 1 ? 1 : 0)}${h.demiVie ? `, oubli en ${h.demiVie} semaines` : ""}`;
}

/** La meilleure methode de reference (hors modele) sur le onze, et sa valeur. */
export function meilleureReference(notes: NotesParMethode): { methode: Exclude<Methode, "modele">; onze: number } | null {
  const refs = (["moteur", "dernier", "frequence"] as const)
    .filter((m) => notes[m].onze !== null)
    .sort((a, b) => (notes[b].onze ?? 0) - (notes[a].onze ?? 0));
  return refs[0] ? { methode: refs[0], onze: notes[refs[0]].onze! } : null;
}

/** Les valeurs d'une serie de la courbe (null = pas de prediction cette semaine-la). */
export function serieCourbe(courbe: readonly PointCourbe[], methode: Methode, mesure: Mesure): (number | null)[] {
  return courbe.map((p) => p[methode][mesure]);
}

/** Les semaines pour lesquelles au moins une prediction a ete faite (la premiere n'en a pas : personne n'a d'historique). */
export const semainesNotees = (courbe: readonly PointCourbe[]): PointCourbe[] => courbe.filter((p) => p.n > 0);

/**
 * Bornes verticales d'une courbe de proportions : de la valeur la plus basse (un peu plus bas, au dixieme) a la plus haute
 * (un peu plus haut), jamais hors de 0 a 1.
 */
export function bornesCourbe(valeurs: readonly (number | null)[]): { min: number; max: number } {
  const v = valeurs.filter((x): x is number => typeof x === "number");
  if (v.length === 0) return { min: 0, max: 1 };
  const min = Math.max(0, Math.floor((Math.min(...v) - 0.03) * 10) / 10);
  const max = Math.min(1, Math.ceil((Math.max(...v) + 0.03) * 10) / 10);
  return max - min < 0.2 ? { min: Math.max(0, Math.round((max - 0.2) * 10) / 10), max } : { min, max };
}

/** Ce que dit un poids de titularisation : il favorise, defavorise ou ne change presque rien. */
export type SensPoids = "favorise" | "defavorise" | "neutre";
export const sensDuPoids = (w: number, seuil = 0.15): SensPoids => (w > seuil ? "favorise" : w < -seuil ? "defavorise" : "neutre");

export interface LignePoids {
  id: string;
  libelle: string;
  aide: string;
  appris: number;
  depart: number;
  /** Ecart appris - depart. */
  variation: number;
  sens: SensPoids;
}

/** Les poids appris, avec leur libelle, leur valeur de depart et leur variation ; dans l'ordre du catalogue. */
export function lignesDePoids(catalogue: readonly Caracteristique[], appris: Poids | null, depart: Poids | null): LignePoids[] {
  if (!appris) return [];
  return catalogue.map((c) => {
    const i = appris.noms.indexOf(c.id);
    const w = i >= 0 ? appris.w[i] : 0;
    const j = depart ? depart.noms.indexOf(c.id) : -1;
    const w0 = j >= 0 && depart ? depart.w[j] : 0;
    return { id: c.id, libelle: c.libelle, aide: c.aide, appris: w, depart: w0, variation: w - w0, sens: sensDuPoids(w) };
  });
}

/** La plus grande valeur absolue parmi les poids (appris et de depart), pour echelonner les barres. */
export const echelleDePoids = (lignes: readonly LignePoids[]): number =>
  Math.max(1, ...lignes.flatMap((l) => [Math.abs(l.appris), Math.abs(l.depart)]));

/** "Manques : A (12 %), B (inconnu)" : ce que le modele n'avait pas vu venir. */
export function texteManques(e: ErreurFeuille): string {
  return e.manques.map((m) => `${m.nom} (${m.proba === null ? "inconnu de l'equipe" : pct(m.proba, 0)})`).join(", ");
}

/** "A (84 %), B (71 %)" : ceux qu'il avait annonces a tort. */
export function texteFauxPositifs(e: ErreurFeuille): string {
  return e.fauxPositifs.map((m) => `${m.nom} (${pct(m.proba, 0)})`).join(", ");
}

/** Le dernier entrainement termine (le plus recent d'abord dans la liste) qui a produit un modele. */
export const dernierReussi = (liste: readonly EntrainementResume[]): EntrainementResume | null =>
  liste.find((e) => e.statut === "termine" && e.modele) ?? null;

/** Resume en une phrase de ce que l'IA fait mieux (ou moins bien) que la meilleure reference. */
export function verdict(r: Pick<ResultatEntrainement, "global" | "recent">): { ton: "bon" | "neutre" | "mauvais"; texte: string } {
  const ref = meilleureReference(r.recent.modele.n > 0 ? r.recent : r.global);
  const mesure = r.recent.modele.n > 0 ? r.recent : r.global;
  const modele = mesure.modele.onze;
  if (modele === null || !ref) return { ton: "neutre", texte: "Pas assez de predictions pour comparer l'IA aux methodes simples." };
  const ecart = (modele - ref.onze) * 100;
  const nom = LIBELLE_METHODE[ref.methode].toLowerCase();
  if (ecart >= 1) return { ton: "bon", texte: `L'IA predit mieux que le meilleur repere (${nom}) : ${ecartPoints(modele, ref.onze)} sur les dernieres semaines.` };
  if (ecart > -1) return { ton: "neutre", texte: `L'IA fait jeu egal avec le meilleur repere (${nom}) : ${ecartPoints(modele, ref.onze)}. Il lui faut plus de matchs pour faire la difference.` };
  return { ton: "mauvais", texte: `L'IA fait moins bien que ${nom} (${ecartPoints(modele, ref.onze)}) : ne l'activez pas tant que cela dure.` };
}

const MOIS = ["janv.", "fevr.", "mars", "avr.", "mai", "juin", "juil.", "aout", "sept.", "oct.", "nov.", "dec."] as const;

/** La date ("jj/mm/aaaa") contenue dans le libelle d'une semaine ("Semaine du 08/12/2025"), en millisecondes UTC. */
export function dateDeSemaine(libelle: string): number | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(libelle);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
}

/** "sept. 25" : le mois et l'annee d'une semaine, pour l'axe d'une courbe. */
export function moisCourt(libelle: string): string {
  const t = dateDeSemaine(libelle);
  if (t === null) return libelle;
  const d = new Date(t);
  return `${MOIS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** Les indices (dans la courbe) ou commence une nouvelle periode apres plus de `jours` jours sans match : l'inter-saison. */
export function coupuresDeCourbe(courbe: readonly Pick<PointCourbe, "libelle">[], jours = 45): number[] {
  const coupures: number[] = [];
  for (let i = 1; i < courbe.length; i++) {
    const avant = dateDeSemaine(courbe[i - 1].libelle);
    const apres = dateDeSemaine(courbe[i].libelle);
    if (avant !== null && apres !== null && (apres - avant) / 86_400_000 > jours) coupures.push(i);
  }
  return coupures;
}

/* ------------------------------------------ reentrainement automatique ------------------------------------------ */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const MOIS_LONGS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"] as const;

/** "chaque mercredi a 5 h (heure de Paris)". */
export const texteFrequence = (p: Pick<PlanningIa, "jour" | "heure">): string => `chaque ${JOURS[p.jour] ?? "semaine"} a ${p.heure} h (heure de Paris)`;

/** "mercredi 8 octobre, 5 h" : un instant ISO, lu a l'heure de Paris quel que soit le fuseau du navigateur. */
export function datePassage(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const parties = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).formatToParts(t);
  const v = (type: string) => Number(parties.find((x) => x.type === type)!.value);
  const jour = JOURS[new Date(Date.UTC(v("year"), v("month") - 1, v("day"))).getUTCDay()];
  const heure = v("minute") === 0 ? `${v("hour")} h` : `${v("hour")} h ${String(v("minute")).padStart(2, "0")}`;
  return `${jour} ${v("day")} ${MOIS_LONGS[v("month") - 1]}, ${heure}`;
}

export type TonDecision = "ok" | "non" | "neutre";

/**
 * Le verdict d'un entrainement face au modele actif, en un mot pour l'historique. `appliquee` : le modele actif a ete remplace ;
 * un lancement manuel n'applique jamais, il donne seulement son avis (c'est a l'administrateur d'activer).
 */
export function badgeDecision(d: Decision | null | undefined): { texte: string; ton: TonDecision } | null {
  if (!d) return null;
  if (d.appliquee) return { texte: "Remplace l'actif", ton: "ok" };
  if (d.action === "remplace") return { texte: "Au moins aussi bon que l'actif", ton: "ok" };
  if (d.action === "conserve") return { texte: "Non retenu", ton: "non" };
  if (d.action === "sans_actif") return { texte: "Non active", ton: "neutre" };
  return { texte: "Inchange", ton: "neutre" };
}

/** Le dernier entrainement automatique, en une phrase pour le panneau du planning. */
export function resumeDernierAuto(dernier: EntrainementResume | null | undefined): string | null {
  if (!dernier) return null;
  const quand = dateHeure(dernier.creeLe);
  if (dernier.statut === "en_cours") return `En cours depuis le ${quand}.`;
  if (dernier.statut === "echec" || dernier.statut === "annule") return `${LIBELLE_STATUT[dernier.statut]} le ${quand} : ${dernier.message ?? "sans precision"}`;
  return `${quand} : ${dernier.decision?.raison ?? "termine."}`;
}
