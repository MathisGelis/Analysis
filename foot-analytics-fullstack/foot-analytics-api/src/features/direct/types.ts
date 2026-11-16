// src/features/direct/types.ts
//
// Vocabulaire des evenements saisis en direct : types, resultats autorises par type, zones du terrain.

export const TYPES_EVENEMENT = [
  "tir", "arret", "corner", "coup_franc", "penalty", "faute", "hors_jeu", "carton_jaune", "carton_rouge", "remplacement", "blessure",
] as const;
export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

const RESULTATS_TIR = ["but", "cadre", "non_cadre", "contre", "poteau"] as const;

/** Resultats permis par type d'evenement ; absent = ce type n'a pas de resultat. */
export const RESULTATS_PAR_TYPE: Partial<Record<TypeEvenement, readonly string[]>> = {
  tir: RESULTATS_TIR,
  coup_franc: RESULTATS_TIR,
  penalty: ["but", "arrete", "rate", "poteau"],
};

/** Ces types, avec le resultat « but », font marquer l'equipe qui les execute. */
export const TYPES_QUI_MARQUENT: readonly TypeEvenement[] = ["tir", "coup_franc", "penalty"];

/** Zones du terrain : 3 tiers (0 = offensif, 1 = median, 2 = defensif) x 5 couloirs (0 = gauche ... 4 = droit), du point de vue de l'equipe qui joue. */
export const TIERS = 3;
export const COULOIRS = 5;
/** Zones du cadre pour un but ou un tir cadre : 2 rangees (haut, bas) x 3 colonnes (gauche, centre, droit). */
export const ZONES_CADRE = 6;
