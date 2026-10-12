// src/features/equipes/equipes.types.ts

export interface RapportFusion {
  club: string;
  saison: string;
  source: { id: string; nom: string; poule: string | null };
  cible: { id: string; nom: string; poule: string | null };
  joueursDeplaces: number;
  seancesDeplacees: number;
}
export interface RapportReconciliation {
  appliquer: boolean;
  fusions: RapportFusion[];
  /** Cas que l'on ne tranche pas : plusieurs equipes deja jouees au meme niveau, ou plusieurs clones sans equipe reelle. */
  ambigus: { club: string; saison: string; niveau: string; equipes: string[] }[];
}
