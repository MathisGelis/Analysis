// src/common/indicateurs.ts
//
// Indicateurs synthetiques calcules a partir de compteurs, partages entre la
// derivation (compteurs globaux du joueur) et les vues par equipe / saison.

/**
 * Note indicative sur 10 : il n'existe pas de notation des joueurs dans les
 * feuilles de match, on part de 5,5 et on ajuste avec la presence (+0,04 par
 * match) et les exclusions (-0,5 par rouge). A calculer sur le perimetre
 * affiche (une saison, une equipe), jamais sur des compteurs d'un autre.
 */
export function noteIndicative(matchs: number, cartonsRouges: number): number {
  return Math.round((5.5 + matchs * 0.04 - cartonsRouges * 0.5) * 10) / 10;
}
