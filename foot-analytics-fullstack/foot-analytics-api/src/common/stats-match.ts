// src/common/stats-match.ts
//
// Buts, passes decisives et cartons d'un joueur dans UN match, deduits des
// evenements de la feuille. Fonction pure, partagee par effectif(),
// championnat() et historique() : les trois avaient leur propre version
// (matching par nom de famille seul, passes jamais comptees dans le classement
// du championnat, double jaune tantot compte tantot ignore), donc la meme
// ligne de joueur affichait des chiffres differents selon l'ecran.
//
// Regles :
//  - un evenement ne compte que pour le cote (dom/ext) du joueur ;
//  - but : evenement "but" dont `joueur` designe le joueur, hors contre son
//    camp ; passe decisive : `joueur2` de ce meme evenement ;
//  - carton jaune : sousType "jaune" ; rouge : "rouge" ou "double_jaune".

import type { Composition, EvenementMatch } from "@/entities";
import { designeLeJoueur } from "./minutes";

type Compo = Pick<Composition, "nom" | "prenom" | "cote">;
type Evt = Pick<EvenementMatch, "type" | "sousType" | "equipe" | "joueur" | "joueur2">;

export interface StatsMatch {
  buts: number;
  passesDecisives: number;
  cartonsJaunes: number;
  cartonsRouges: number;
}

export const STATS_MATCH_VIDES: Readonly<StatsMatch> = Object.freeze({
  buts: 0, passesDecisives: 0, cartonsJaunes: 0, cartonsRouges: 0,
});

export function statsDuMatch(compo: Compo, evenementsDuMatch: Evt[]): StatsMatch {
  const s: StatsMatch = { ...STATS_MATCH_VIDES };
  for (const e of evenementsDuMatch) {
    if (e.equipe !== compo.cote) continue;
    if (e.type === "but" && e.sousType !== "csc") {
      if (designeLeJoueur(e.joueur, compo)) s.buts++;
      else if (e.joueur2 && designeLeJoueur(e.joueur2, compo)) s.passesDecisives++;
    } else if (e.type === "carton" && designeLeJoueur(e.joueur, compo)) {
      if (e.sousType === "jaune") s.cartonsJaunes++;
      else if (e.sousType === "rouge" || e.sousType === "double_jaune") s.cartonsRouges++;
    }
  }
  return s;
}

/** Somme de deux jeux de stats (agregation sur plusieurs matchs). */
export function cumuler(a: StatsMatch, b: StatsMatch): StatsMatch {
  return {
    buts: a.buts + b.buts,
    passesDecisives: a.passesDecisives + b.passesDecisives,
    cartonsJaunes: a.cartonsJaunes + b.cartonsJaunes,
    cartonsRouges: a.cartonsRouges + b.cartonsRouges,
  };
}
