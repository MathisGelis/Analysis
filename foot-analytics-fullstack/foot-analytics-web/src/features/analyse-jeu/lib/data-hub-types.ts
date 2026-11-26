// src/features/analyse-jeu/lib/data-hub-types.ts
//
// Ce que renvoient le Data Hub de mon equipe et les stats d'un joueur (voir foot-analytics-api/src/features/analyse-jeu/data-hub.ts).

import type { Lieu, PourContre, TirCarte } from "./jeu-types";

export interface DataHubJoueur {
  joueurId: string; nom: string; poste: string | null; minutes: number | null; noteMoyenne: number | null; scoreFatigue: number | null;
  matchs: number; buts: number; passes: number; passesCles: number; tirs: number; cadres: number; xg: number; arrets: number; jaunes: number; rouges: number;
}

export interface DataHub {
  couverture: { matchs: number; saisis: number };
  resultats: {
    joues: number; v: number; n: number; d: number; pts: number; ptsParMatch: number | null; bp: number; bc: number; diff: number;
    cleanSheets: number; sansMarquer: number; forme: ("V" | "N" | "D")[];
  };
  attaque: null | {
    tirs: PourContre; cadres: PourContre; buts: PourContre; xg: PourContre;
    tirsParMatch: { pour: number | null; contre: number | null };
    cadresPct: { pour: number | null; contre: number | null };
    conversion: { pour: number | null; contre: number | null };
    butsMoinsXg: number; xgParTir: number | null;
    grossesOccasions: { pour: number; transformees: number; contre: number };
    tiersOffensif: PourContre;
  };
  defense: null | {
    butsEncaisses: number; tirsConcedes: number; cadresConcedes: number; xgConcede: number; butsEncaissesMoinsXg: number;
    arrets: number; arretsPct: number | null; cleanSheets: number;
  };
  coupsDePiedArretes: null | {
    corners: PourContre; coupsFrancs: PourContre; penaltys: PourContre; butsSurCpa: PourContre; penaltysTires: { tires: number; marques: number };
  };
  discipline: null | { fautes: PourContre; horsJeux: PourContre; jaunes: PourContre; rouges: PourContre; fautesParMatch: number | null };
  tirs: { pour: TirCarte[]; contre: TirCarte[] };
  tranches: { pour: number[]; contre: number[]; matchsCouverts: number };
  contextes: { famille: string; tirs: number; buts: number }[];
  joueurs: DataHubJoueur[];
  parMatch: { matchId: string; date: string | null; adversaireId: string | null; adversaire: string; domicile: boolean; bp: number; bc: number; saisi: boolean;
    tirs: number | null; tirsContre: number | null; xg: number | null; xgContre: number | null; arrets: number | null }[];
}

export interface ReponseDataHub {
  filtres: { equipeId?: string; saisonId?: string; lieu: Lieu; derniers: number | null };
  matchsDeLaSaison: number;
  hub: DataHub;
}

export interface StatsJoueurDirect {
  joueurId: string; matchs: number; buts: number; passes: number; passesCles: number; tirs: number; cadres: number; xg: number;
  penaltys: { tires: number; marques: number }; coupsFrancs: { tires: number; buts: number };
  corners: number; arrets: number; fautes: number; horsJeux: number; jaunes: number; rouges: number; entrees: number; sorties: number; blessures: number;
  tirsDetail: (TirCarte & { matchId: string })[];
  parMatch: { matchId: string; date: string | null; adversaireId: string | null; adversaire: string; domicile: boolean; bp: number; bc: number;
    buts: number; passes: number; tirs: number; cadres: number; xg: number; arrets: number; fautes: number; jaunes: number; rouges: number }[];
}

export interface ReponseStatsJoueur { saisonId: string | null; matchsDeLaSaison: number; matchsSaisis: number; stats: StatsJoueurDirect }
