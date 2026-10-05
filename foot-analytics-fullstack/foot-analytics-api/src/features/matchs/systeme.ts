// src/features/matchs/systeme.ts
//
// SYSTEME DE JEU (dispositif : 4-4-2, 4-3-3...) d'une equipe et prediction de celui du prochain adversaire.
//
// Ce que la feuille de match ne dit PAS : la FMI ne contient aucun dispositif, et la numerotation des onze
// (1 a 11 dans 96 % des feuilles) n'en dit rien non plus. Le systeme est donc une SAISIE du staff (sur la fiche du
// match). Jusqu'ici l'import ecrivait a la place un couple en dur, "4-4-2" / "4-2-3-1", sur CHAQUE match : une
// donnee inventee, qui ne doit jamais alimenter une prediction. La prediction ne s'appuie que sur les systemes
// reellement renseignes et dit sur combien de matchs elle repose.
//
// Fonctions pures.

import { parseDateFlexible } from "@/common/dates";

/** Les valeurs ecrites en dur par l'ancien import, sur le match recevant / visiteur. */
export const FORMATION_INVENTEE = { dom: "4-4-2", ext: "4-2-3-1" } as const;

/** "4-2-3-1" : 2 a 5 lignes de 1 a 6 joueurs, dix joueurs de champ au total. */
export function formationValide(formation: string | null | undefined): boolean {
  const n = (formation ?? "").split("-").map((x) => Number(x.trim()));
  return n.length >= 2 && n.length <= 5 && n.every((x) => Number.isInteger(x) && x >= 1 && x <= 6)
    && n.reduce((s, x) => s + x, 0) === 10;
}

/** Saisie libre -> "4-3-3" : espaces retires, vide -> null. Une valeur non valide est rendue telle quelle (a refuser). */
export function normaliserFormation(valeur: string | null | undefined): string | null {
  const v = (valeur ?? "").replace(/\s+/g, "").replace(/[–—−]/g, "-");
  return v === "" ? null : v;
}

interface AvecFormations { formationDom?: string | null; formationExt?: string | null }

/** Ce couple est celui que l'ancien import ecrivait sur chaque feuille : jamais une observation. */
export function estFormationInventee(m: AvecFormations): boolean {
  return m.formationDom === FORMATION_INVENTEE.dom && m.formationExt === FORMATION_INVENTEE.ext;
}

/** Les deux systemes d'un match tels qu'ils sont RENSEIGNES : le couple invente et les valeurs illisibles sont ecartes. */
export function systemesRenseignes(m: AvecFormations): { dom: string | null; ext: string | null } {
  if (estFormationInventee(m)) return { dom: null, ext: null };
  const lire = (f: string | null | undefined) => (formationValide(f) ? (f as string) : null);
  return { dom: lire(m.formationDom), ext: lire(m.formationExt) };
}

/**
 * Qui peut saisir un dispositif. Les dispositifs sont des observations de championnat (on les releve aussi sur les matchs
 * des adversaires, c'est ce qui alimente la prediction de leur systeme) : tout compte peut RENSEIGNER un dispositif
 * encore vide, sur n'importe quel match d'une saison qui lui est ouverte. Corriger ou effacer un dispositif deja saisi
 * est reserve a ceux qui gerent le match (un des deux clubs, l'equipe attribuee) et a l'administrateur : `libre`.
 * Renvoie la raison du refus, ou null si la saisie est permise.
 */
export function refusSaisieDispositifs(
  actuels: AvecFormations, demande: AvecFormations, libre: boolean,
): string | null {
  if (libre) return null;
  const courants = systemesRenseignes(actuels);
  for (const [cle, cote, equipe] of [["formationDom", "dom", "recevante"], ["formationExt", "ext", "visiteuse"]] as const) {
    if (demande[cle] === undefined) continue;
    const actuel = courants[cote];
    if (actuel !== null && normaliserFormation(demande[cle]) !== actuel) {
      return `Le dispositif de l'equipe ${equipe} est deja renseigne (${actuel}) : seul un club du match ou un administrateur peut le modifier.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Prediction
// ---------------------------------------------------------------------------

export interface ObservationSysteme { date: string | null; systeme: string }

export interface PredictionSysteme {
  systeme: string;
  /** Poids du systeme retenu parmi les observations, en % (les plus recentes pesent plus). */
  confiance: number;
  /** Nombre de matchs renseignes sur lesquels la prediction repose. */
  observations: number;
  /** faible : moins de 3 matchs ; moyenne : 3 ou 4 ; bonne : 5 et plus. */
  fiabilite: "faible" | "moyenne" | "bonne";
  /** Les autres systemes vus, du plus au moins probable. */
  alternatives: { systeme: string; poids: number }[];
}

/**
 * Systeme le plus probable d'une equipe : parmi ses `fenetre` derniers matchs renseignes, le systeme au plus gros
 * poids, le match le plus recent comptant le plus (poids `n`, puis `n - 1`... jusqu'a 1). A egalite, le plus recent.
 * Sans aucune observation : null (jamais de valeur par defaut).
 */
export function predireSysteme(observations: ObservationSysteme[], fenetre = 8): PredictionSysteme | null {
  const valides = observations.filter((o) => formationValide(o.systeme));
  if (valides.length === 0) return null;
  // Plus recent d'abord ; sans date lisible, en dernier.
  const recentes = valides
    .map((o, i) => ({ ...o, t: parseDateFlexible(o.date), i }))
    .sort((a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity) || a.i - b.i)
    .slice(0, fenetre);

  const n = recentes.length;
  const poids = new Map<string, number>();
  recentes.forEach((o, rang) => poids.set(o.systeme, (poids.get(o.systeme) ?? 0) + (n - rang)));
  const total = [...poids.values()].reduce((s, p) => s + p, 0);
  const classes = [...poids].map(([systeme, p]) => ({ systeme, p }))
    // Egalite : celui du match le plus recent (le premier de `recentes`).
    .sort((a, b) => b.p - a.p || recentes.findIndex((o) => o.systeme === a.systeme) - recentes.findIndex((o) => o.systeme === b.systeme));

  return {
    systeme: classes[0].systeme,
    confiance: Math.round((classes[0].p / total) * 100),
    observations: n,
    fiabilite: n >= 5 ? "bonne" : n >= 3 ? "moyenne" : "faible",
    alternatives: classes.slice(1).map((c) => ({ systeme: c.systeme, poids: Math.round((c.p / total) * 100) })),
  };
}
