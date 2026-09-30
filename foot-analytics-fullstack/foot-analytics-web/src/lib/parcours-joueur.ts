// src/lib/parcours-joueur.ts
//
// Derniere saison connue d'un joueur, telle que la recherche du serveur la renvoie
// (foot-analytics-api/src/modules/joueurs/joueurs.module.ts : `avecParcours`).

export interface DerniereSaison {
  id: string;
  /** "2024-2025". */
  nom: string;
  /** "24-25". */
  court: string;
  /** Vrai pour la saison en cours. */
  enCours: boolean;
}

/** "24-25" quand la derniere saison connue n'est pas la saison en cours ; sinon rien a signaler. */
export function saisonPassee(d: DerniereSaison | null | undefined): string | null {
  return d && !d.enCours ? d.court : null;
}
