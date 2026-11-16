// src/features/direct/lib/actions.ts
//
// Les actions de la grille, leurs etapes de saisie, et les libelles : tout ce qui decrit « comment on note un tir » en un seul endroit.

import type { Cote, EvenementDirect, TypeAction } from "./direct-types";

export type Etape = "joueur" | "joueur2" | "zone";

export interface DefAction {
  id: string;
  libelle: string;
  type: TypeAction;
  /** Resultat deja choisi quand on part du bouton (« But » = un tir dont le resultat est but). */
  resultatInitial?: string;
  etapes: Etape[];
  /** Resultats proposes a l'etape zone ; absent = pas de choix de resultat. */
  resultats?: string[];
  /** Le resultat est obligatoire pour enregistrer. */
  resultatObligatoire?: boolean;
  /** L'etape zone propose le terrain ; faux pour un penalty (le point de penalty est toujours le meme). */
  terrain?: boolean;
  contexte?: boolean;
  /** Titre du joueur principal et du second. */
  roleJoueur: string;
  roleJoueur2?: string;
  /** Les deux joueurs sont obligatoires (remplacement). */
  joueurObligatoire?: boolean;
}

const RESULTATS_TIR = ["but", "cadre", "non_cadre", "contre", "poteau"];

export const ACTIONS: DefAction[] = [
  { id: "but", libelle: "But", type: "tir", resultatInitial: "but", etapes: ["joueur", "zone"], resultats: RESULTATS_TIR, resultatObligatoire: true, terrain: true, contexte: true, roleJoueur: "Qui a marqué ?", roleJoueur2: "Passeur" },
  { id: "tir", libelle: "Tir", type: "tir", etapes: ["joueur", "zone"], resultats: RESULTATS_TIR, resultatObligatoire: true, terrain: true, contexte: true, roleJoueur: "Qui tire ?", roleJoueur2: "Passeur" },
  { id: "arret", libelle: "Arrêt", type: "arret", etapes: ["joueur"], roleJoueur: "Quel gardien ?" },
  { id: "corner", libelle: "Corner", type: "corner", etapes: ["joueur", "zone"], terrain: true, roleJoueur: "Qui tire le corner ?" },
  { id: "coup_franc", libelle: "Coup franc", type: "coup_franc", etapes: ["joueur", "zone"], resultats: RESULTATS_TIR, terrain: true, contexte: true, roleJoueur: "Qui tire ?", roleJoueur2: "Passeur" },
  { id: "penalty", libelle: "Penalty", type: "penalty", etapes: ["joueur", "zone"], resultats: ["but", "arrete", "rate", "poteau"], resultatObligatoire: true, roleJoueur: "Qui tire ?" },
  { id: "faute", libelle: "Faute", type: "faute", etapes: ["joueur", "zone"], terrain: true, roleJoueur: "Qui commet la faute ?" },
  { id: "hors_jeu", libelle: "Hors-jeu", type: "hors_jeu", etapes: ["joueur"], roleJoueur: "Qui est hors-jeu ?" },
  { id: "carton_jaune", libelle: "Carton jaune", type: "carton_jaune", etapes: ["joueur"], roleJoueur: "Qui est averti ?" },
  { id: "carton_rouge", libelle: "Carton rouge", type: "carton_rouge", etapes: ["joueur"], roleJoueur: "Qui est expulsé ?" },
  { id: "remplacement", libelle: "Remplacement", type: "remplacement", etapes: ["joueur", "joueur2"], roleJoueur: "Qui sort ?", roleJoueur2: "Qui entre ?", joueurObligatoire: true },
  { id: "blessure", libelle: "Blessure", type: "blessure", etapes: ["joueur"], roleJoueur: "Qui est blessé ?" },
];

export const action = (id: string): DefAction => ACTIONS.find((a) => a.id === id) as DefAction;

export const LIBELLE_RESULTAT: Record<string, string> = {
  but: "But", cadre: "Cadré, arrêté", non_cadre: "Non cadré", contre: "Contré", poteau: "Poteau ou barre", arrete: "Arrêté", rate: "Raté",
};

const LIBELLE_TYPE: Record<TypeAction, string> = {
  tir: "Tir", arret: "Arrêt", corner: "Corner", coup_franc: "Coup franc", penalty: "Penalty", faute: "Faute", hors_jeu: "Hors-jeu",
  carton_jaune: "Carton jaune", carton_rouge: "Carton rouge", remplacement: "Remplacement", blessure: "Blessure",
};

/** « But », « Tir cadré », « Carton jaune »... : le titre d'un evenement dans la frise. */
export function libelleEvenement(e: Pick<EvenementDirect, "type" | "resultat">): string {
  if (e.type === "tir") {
    if (e.resultat === "but") return "But";
    if (e.resultat === "cadre") return "Tir cadré";
    if (e.resultat === "non_cadre") return "Tir non cadré";
    if (e.resultat === "contre") return "Tir contré";
    if (e.resultat === "poteau") return "Tir sur le poteau";
    return "Tir";
  }
  if (e.type === "penalty" && e.resultat) return `Penalty ${e.resultat === "but" ? "marqué" : e.resultat === "arrete" ? "arrêté" : e.resultat === "rate" ? "raté" : "sur le poteau"}`;
  if (e.type === "coup_franc" && e.resultat) return e.resultat === "but" ? "But sur coup franc" : `Coup franc ${LIBELLE_RESULTAT[e.resultat]?.toLowerCase() ?? ""}`.trim();
  return LIBELLE_TYPE[e.type];
}

export const CONTEXTES_PRINCIPAUX = ["Attaque placée", "Attaque rapide", "Récup haute", "CPA"];
export const CONTEXTES_AUTRES = ["Contre-attaque", "Centre", "Jeu en profondeur", "Frappe de loin", "Rebond", "1 contre 1", "Relance du gardien"];

const TIERS = ["Offensif", "Médian", "Défensif"];
const TIERS_COURTS = ["Off.", "Méd.", "Déf."];
const COULOIRS = ["gauche", "axe gauche", "centre", "axe droit", "droit"];
const COULOIRS_COURTS = ["gauche", "axe g.", "centre", "axe d.", "droit"];
const CADRES = ["haut gauche", "haut centre", "haut droit", "bas gauche", "bas centre", "bas droit"];

export const NB_TIERS = TIERS.length;
export const NB_COULOIRS = COULOIRS.length;
export const NB_CADRES = CADRES.length;

export const nomZone = (tier: number, couloir: number): string => `${TIERS[tier]} · ${COULOIRS[couloir]}`;
/** « Off. centre » : la zone en deux mots, pour une ligne de frise. */
export const zoneCourte = (tier: number | null, couloir: number | null): string =>
  tier === null || couloir === null ? "" : `${TIERS_COURTS[tier]} ${COULOIRS_COURTS[couloir]}`;
export const nomCadre = (i: number): string => `Cadre ${CADRES[i]}`;

/** Le joueur d'un evenement : « n°9 Martin », « n°9 » (adversaire), ou « Joueur inconnu ». */
export function joueurLibelle(numero: number | null, nom: string | null): string {
  if (numero === null && !nom) return "";
  return [numero === null ? null : `n°${numero}`, nom].filter(Boolean).join(" ");
}

export const nomDuCote = (cote: Cote, nousCote: Cote): string => (cote === nousCote ? "notre équipe" : "adversaire");
