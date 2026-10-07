// src/features/coachs/lib/fiche-coach-types.ts
//
// Forme de la reponse de GET /coachs/:id/fiche. Miroir de FicheCoach
// (foot-analytics-api/src/common/fiche-coach.ts) : le serveur reste la source.

export interface BilanCoach {
  matchs: number; v: number; n: number; d: number;
  bp: number; bc: number; pts: number; ppm: number; pctV: number;
}

export interface MatchCoachLigne {
  matchId: string;
  date: string | null;
  journee: string | null;
  competition: string | null;
  saisonId: string | null;
  clubId: string;
  adversaireId: string;
  domicile: boolean;
  bp: number; bc: number;
  issue: "V" | "N" | "D";
  fonctions: string[];
}

export interface FicheCoach {
  coach: {
    id: string; nom: string; prenom: string | null; licence: string | null; clubId: string | null;
    cartonsJaunes: number; cartonsRouges: number; motifsTop: string | null;
  };
  bilan: BilanCoach;
  fonctionPrincipale: string | null;
  fonctions: { code: string; libelle: string; matchs: number }[];
  clubActuelId: string | null;
  parSaison: { saisonId: string | null; saisonNom: string | null; clubId: string; bilan: BilanCoach }[];
  parcours: { clubId: string; premierMatch: string | null; dernierMatch: string | null; matchs: number }[];
  matchs: MatchCoachLigne[];
}
