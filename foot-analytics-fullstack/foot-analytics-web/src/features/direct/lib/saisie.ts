// src/features/direct/lib/saisie.ts
//
// Une saisie en cours (le tir qu'on est en train de noter) et sa transformation en evenement a envoyer. Fonctions pures.

import { action } from "./actions";
import type { Cote, EvenementDirect, SaisieEvenement } from "./direct-types";

export interface Saisie {
  actionId: string;
  cote: Cote;
  periode: number;
  minute: number;
  joueurNumero: number | null;
  joueurNom: string | null;
  joueurId: string | null;
  joueur2Numero: number | null;
  joueur2Nom: string | null;
  joueur2Id: string | null;
  zoneTier: number | null;
  zoneCouloir: number | null;
  zoneCadre: number | null;
  resultat: string | null;
  contextes: string[];
}

export function saisieInitiale(actionId: string, cote: Cote, periode: number, minute: number): Saisie {
  return {
    actionId, cote, periode, minute, joueurNumero: null, joueurNom: null, joueurId: null, joueur2Numero: null, joueur2Nom: null, joueur2Id: null,
    zoneTier: null, zoneCouloir: null, zoneCadre: null, resultat: action(actionId).resultatInitial ?? null, contextes: [],
  };
}

/** Le tir a une zone du cadre quand il est cadre ou marque. */
export const aUnCadre = (resultat: string | null): boolean => resultat === "but" || resultat === "cadre" || resultat === "arrete";

/** Peut-on enregistrer ? Sinon, ce qui manque (dit a l'ecran, jamais devine). */
export function manque(s: Saisie): string | null {
  const def = action(s.actionId);
  if (def.resultatObligatoire && !s.resultat) return "Choisis le résultat.";
  if (def.joueurObligatoire && (s.joueurNumero === null || s.joueur2Numero === null)) return s.joueurNumero === null ? "Choisis le joueur qui sort." : "Choisis le joueur qui entre.";
  return null;
}

/** L'evenement a envoyer : ce qui n'a pas de sens pour l'action (zone d'un arret, cadre d'un tir non cadre) est retire. */
export function versEvenement(s: Saisie, id: string): SaisieEvenement {
  const def = action(s.actionId);
  const resultat = def.resultats && s.resultat && def.resultats.includes(s.resultat) ? s.resultat : null;
  const zone = def.terrain && s.zoneTier !== null && s.zoneCouloir !== null;
  return {
    id, cote: s.cote, type: def.type, resultat, periode: s.periode, minute: s.minute,
    joueurNumero: s.joueurNumero, joueurNom: s.joueurNom, joueurId: s.joueurId,
    joueur2Numero: def.etapes.includes("joueur2") || def.roleJoueur2 ? s.joueur2Numero : null,
    joueur2Nom: def.etapes.includes("joueur2") || def.roleJoueur2 ? s.joueur2Nom : null,
    joueur2Id: def.etapes.includes("joueur2") || def.roleJoueur2 ? s.joueur2Id : null,
    zoneTier: zone ? s.zoneTier : null, zoneCouloir: zone ? s.zoneCouloir : null,
    zoneCadre: def.terrain && aUnCadre(resultat) ? s.zoneCadre : null,
    contextes: def.contexte ? s.contextes : [],
  };
}

/** L'action de la grille qui correspond a un evenement (pour le corriger avec le meme ecran). */
export function actionDe(e: Pick<EvenementDirect, "type">): string {
  return e.type;
}

export function saisieDepuisEvenement(e: EvenementDirect): Saisie {
  return {
    actionId: actionDe(e), cote: e.cote, periode: e.periode, minute: e.minute,
    joueurNumero: e.joueurNumero, joueurNom: e.joueurNom, joueurId: e.joueurId,
    joueur2Numero: e.joueur2Numero, joueur2Nom: e.joueur2Nom, joueur2Id: e.joueur2Id,
    zoneTier: e.zoneTier, zoneCouloir: e.zoneCouloir, zoneCadre: e.zoneCadre, resultat: e.resultat, contextes: [...e.contextes],
  };
}
