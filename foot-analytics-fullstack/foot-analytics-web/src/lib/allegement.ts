// src/lib/allegement.ts
//
// Allegement des donnees passees d'un Server Component a un Client Component : tout ce qui traverse
// cette frontiere est serialise dans la page (et redigere dans le HTML). Une liste de 500 joueurs
// portee avec tous ses champs pese plusieurs centaines de Ko dont la vue n'utilise qu'une fraction.
// Les types `Pick` des composants font echouer la compilation si une vue lit un champ retire.

import type { Joueur, Match } from "@/lib/types";

/** Copie de chaque objet restreinte aux `champs` (les champs absents restent absents). */
export function garder<T extends object, K extends keyof T>(liste: readonly T[], champs: readonly K[]): Pick<T, K>[] {
  return liste.map((o) => {
    const copie = {} as Pick<T, K>;
    for (const c of champs) if (c in o) copie[c] = o[c];
    return copie;
  });
}

/** Ce que les onglets du classement lisent d'un match (stats d'equipes). */
export const CHAMPS_MATCH_CLASSEMENT = ["id", "clubDom", "clubExt", "scoreDom", "scoreExt", "statut"] as const satisfies readonly (keyof Match)[];
export type MatchClassement = Pick<Match, (typeof CHAMPS_MATCH_CLASSEMENT)[number]>;

/** Ce que l'onglet "Stats joueurs" lit d'un joueur. */
export const CHAMPS_JOUEUR_CLASSEMENT = [
  "id", "clubId", "nom", "prenom", "licence", "matchs", "titularisations", "minutes", "buts",
  "passesDecisives", "cartonsJaunes", "cartonsRouges", "noteMoyenne", "scoreFatigue", "fatigueDetail",
] as const satisfies readonly (keyof Joueur)[];
export type JoueurClassement = Pick<Joueur, (typeof CHAMPS_JOUEUR_CLASSEMENT)[number]>;
