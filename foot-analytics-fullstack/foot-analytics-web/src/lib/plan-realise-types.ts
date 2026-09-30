// src/lib/plan-realise-types.ts
//
// Forme de la reponse de GET /tactiques/comparaison. Miroir de PlanContreRealise
// (foot-analytics-api/src/modules/tactiques/tactiques.module.ts) et de common/plan-realise.ts.

import type { Piste } from "@/lib/prematch-types";

export type RolePrevu = "titulaire" | "remplacant" | null;
export type RoleReel = "titulaire" | "entre" | "banc" | "absent";
export type Ecart = "conforme" | "promu" | "relegue" | "absent" | "surprise" | "non_prevu";

export interface LigneComparaison {
  joueurId: string | null;
  nom: string;
  prevu: RolePrevu;
  reel: RoleReel;
  minutes: number | null;
  ecart: Ecart;
}

export interface ComparaisonPlanRealise {
  etat: "ok" | "feuille_vide";
  formation: { prevue: string; reelle: string | null; identique: boolean | null };
  capitaine: { prevu: string | null; reel: string | null; identique: boolean | null };
  titulairesPrevus: number;
  titulairesConformes: number;
  adequation: number | null;
  lignes: LigneComparaison[];
  observations: Piste[];
}

export interface PlanContreRealise {
  etat: "ok" | "aucun_match_prepare" | "match_non_joue" | "pas_de_plan" | "feuille_vide";
  match: {
    id: string; date: string | null; journee: string | null; domicile: boolean;
    adversaireClubId: string; buts: number; butsAdversaire: number;
  } | null;
  plan: { formation: string; modifieLe: string; source: "match" | "courant"; modifieApresMatch: boolean } | null;
  comparaison: ComparaisonPlanRealise | null;
}

export const LIBELLE_PREVU: Record<Exclude<RolePrevu, null>, string> = { titulaire: "Titulaire", remplacant: "Remplacant" };
export const LIBELLE_REEL: Record<RoleReel, string> = {
  titulaire: "Titulaire", entre: "Entre en jeu", banc: "Banc, non utilise", absent: "Absent de la feuille",
};
export const LIBELLE_ECART: Record<Ecart, string> = {
  conforme: "Conforme", promu: "Promu titulaire", relegue: "Au banc", absent: "Absent", surprise: "Non prevu", non_prevu: "Non prevu",
};
/** Classes (jetons du theme) de la pastille d'ecart. */
export const PASTILLE_ECART: Record<Ecart, string> = {
  conforme: "border-win/35 bg-win/10 text-win",
  promu: "border-accent/35 bg-accent/10 text-accent",
  surprise: "border-accent/35 bg-accent/10 text-accent",
  non_prevu: "border-accent/35 bg-accent/10 text-accent",
  relegue: "border-amber/35 bg-amber/10 text-amber",
  absent: "border-loss/35 bg-loss/10 text-loss",
};
