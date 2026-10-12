// src/features/prematch/lib/onze-terrain.ts
//
// Le onze probable lu dans les numeros de maillot, range pour le composant Pitch : un joueur par poste, le gardien
// d'abord puis chaque ligne du dispositif (l'ordre `disposition` que donne le serveur). Un poste sans joueur probable
// reste vide (cercle en pointilles), jamais rempli au hasard. Fonctions pures.

import type { JoueurTerrain } from "@/shared/ui/Pitch";
import { nomDeFamille } from "@/features/analyse/lib/dispositif-equipe";

import type { PosteProbable } from "./numeros-types";

/** Les numeros dans l'ordre du terrain : le gardien, puis la defense, le milieu, l'attaque. */
export function ordreTerrain(disposition: number[][]): number[] {
  return [1, ...disposition.flat()];
}

export function joueursSurTerrain(onze: PosteProbable[], disposition: number[][]): (JoueurTerrain | null)[] {
  const parNumero = new Map(onze.map((p) => [p.numero, p]));
  return ordreTerrain(disposition).map((numero) => {
    const p = parNumero.get(numero);
    return p?.nom ? { numero, nom: nomDeFamille(p.nom) } : null;
  });
}

/** Libelle de chaque poste dans le meme ordre (pour les postes vides) : "DCD", "MC"... */
export function libellesPostes(onze: PosteProbable[], disposition: number[][]): string[] {
  const parNumero = new Map(onze.map((p) => [p.numero, p.poste]));
  return ordreTerrain(disposition).map((numero) => parNumero.get(numero) ?? String(numero));
}
