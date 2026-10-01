// src/features/analyse/lib/situation-types.ts
//
// Reponse de GET /analyse/club/:id/situation (voir foot-analytics-api/src/modules/analyse/situation.service.ts).

export interface DernierMatch {
  id: string; date: string | null; journee: string | null; domicile: boolean; adversaireId: string;
  bp: number; bc: number; issue: "V" | "N" | "D";
  /** Dispositif renseigne pour CE match, null sinon. */
  formation: string | null;
}

export interface JoueurOnze {
  numero: number; nom: string; prenom: string | null; licence: string | null;
  joueurId: string | null; poste: string | null;
  capitaine: boolean; minutes: number;
}

export interface SituationClub {
  clubId: string; equipeId: string | null; saisonId: string | null;
  systeme: {
    prediction: {
      systeme: string; confiance: number; observations: number; fiabilite: "faible" | "moyenne" | "bonne";
      alternatives: { systeme: string; poids: number }[];
    } | null;
    observes: number; matchs: number; dernierMatchId: string | null;
  };
  dernierMatch: DernierMatch | null;
  dernierOnze: { match: DernierMatch; titulaires: JoueurOnze[]; remplacants: JoueurOnze[] } | null;
}
