// src/features/tactiques/tactiques.types.ts

import { ComparaisonPlanRealise } from "./plan-realise";

/** Plan compare a la feuille d'un match joue (GET /tactiques/comparaison). */
export interface PlanContreRealise {
  /**
   * ok : comparaison faite. aucun_match_prepare : aucun match joue n'a de plan (sans `matchId`).
   * match_non_joue / pas_de_plan / feuille_vide : le match est connu mais la comparaison est impossible.
   */
  etat: "ok" | "aucun_match_prepare" | "match_non_joue" | "pas_de_plan" | "feuille_vide";
  match: {
    id: string; date: string | null; journee: string | null; domicile: boolean;
    adversaireClubId: string; buts: number; butsAdversaire: number;
  } | null;
  plan: {
    formation: string; modifieLe: string;
    /** "match" : plan rattache a ce match ; "courant" : plan courant de l'equipe, a defaut. */
    source: "match" | "courant";
    /** Plan modifie apres la rencontre : il a pu etre ajuste sur le realise, a lire avec prudence. */
    modifieApresMatch: boolean;
  } | null;
  comparaison: ComparaisonPlanRealise | null;
}
