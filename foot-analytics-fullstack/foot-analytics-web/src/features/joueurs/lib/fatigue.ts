// src/features/joueurs/lib/fatigue.ts
//
// Fatigue d'un joueur (0 = frais, 100 = surcharge) : niveaux, couleurs et lecture du detail servi
// par l'API (foot-analytics-api/src/common/fatigue.ts reste la source du calcul). Fonctions pures.

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

export interface FatigueDetail {
  niveau: NiveauFatigue | null;
  raison: "indisponible" | "aucune_donnee" | null;
  /** "partielle" : estimation (matchs seuls ou moins de 2 semaines d'historique). */
  fiabilite: "solide" | "partielle";
  minutes7j: number;
  matchs14j: number;
  joursDepuisMatch: number | null;
  joursDepuisEffort: number | null;
  facteurs: FacteurFatigue[];
  calculeLe: string;
}

export const LIBELLE_NIVEAU: Record<NiveauFatigue, string> = {
  frais: "Frais", normal: "Normal", charge: "Charge", surcharge: "Surcharge",
};

/** Classes Tailwind (jetons du theme) : texte et fond de chaque niveau. */
export const TEXTE_NIVEAU: Record<NiveauFatigue, string> = {
  frais: "text-win", normal: "text-accent", charge: "text-amber", surcharge: "text-danger",
};
export const FOND_NIVEAU: Record<NiveauFatigue, string> = {
  frais: "bg-win", normal: "bg-accentstrong", charge: "bg-amber", surcharge: "bg-danger",
};
/** Couleurs de series (variables du theme) pour les anneaux et graphiques. */
export const COULEUR_NIVEAU: Record<NiveauFatigue, string> = {
  frais: "rgb(var(--win))", normal: "rgb(var(--accent))", charge: "rgb(var(--amber))", surcharge: "rgb(var(--danger))",
};
export const PASTILLE_NIVEAU: Record<NiveauFatigue, string> = {
  frais: "border-win/35 bg-win/10 text-win",
  normal: "border-accent/35 bg-accent/10 text-accent",
  charge: "border-amber/35 bg-amber/10 text-amber",
  surcharge: "border-danger/35 bg-danger/10 text-danger",
};

/** Niveau d'un score. Memes seuils que l'API : < 35 frais, < 55 normal, < 75 charge, sinon surcharge. */
export function niveauFatigue(score: number | null | undefined): NiveauFatigue | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score < 35) return "frais";
  if (score < 55) return "normal";
  if (score < 75) return "charge";
  return "surcharge";
}

/** Detail JSON servi par l'API ; null si absent ou illisible (jamais d'exception cote page). */
export function lireDetailFatigue(json: string | null | undefined): FatigueDetail | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json) as FatigueDetail;
    return d && Array.isArray(d.facteurs) ? d : null;
  } catch {
    return null;
  }
}

/** Les facteurs qui pesent le plus dans le score, du plus lourd au plus leger. */
export function facteursPrincipaux(detail: FatigueDetail, max = 3): FacteurFatigue[] {
  return [...detail.facteurs].sort((a, b) => b.points - a.points).slice(0, max);
}

/** Le score n'est-il qu'une estimation ? (matchs seuls, historique court) */
export const estEstimation = (detail: FatigueDetail | null): boolean => !!detail && detail.fiabilite === "partielle";

/** Joueurs a surveiller : les plus fatigues d'abord, ceux sans score ecartes. */
export function plusFatigues<T extends { scoreFatigue?: number | null }>(joueurs: T[], max = 5): T[] {
  return joueurs
    .filter((j): j is T & { scoreFatigue: number } => typeof j.scoreFatigue === "number")
    .sort((a, b) => b.scoreFatigue - a.scoreFatigue)
    .slice(0, max);
}
