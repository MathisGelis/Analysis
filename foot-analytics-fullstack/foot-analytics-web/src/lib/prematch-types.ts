// src/lib/prematch-types.ts
//
// Forme de la reponse de GET /analyse/prematch. Miroir de RapportPrematch
// (foot-analytics-api/src/modules/analyse/prematch.service.ts) : le serveur reste la source.

import type { Bilan, Insight, Issue, SensTendance, TypeSerie } from "@/lib/analyse-types";

export interface ProfilPrematch {
  nom: string;
  matchs: number;
  rang: number | null;
  pts: number | null;
  ppm: number;
  bpm: number;
  bcm: number;
  sens: SensTendance;
  attaque: SensTendance;
  defense: SensTendance;
  score: number | null;
  libelle: string;
  domicile: { joues: number; ppm: number };
  exterieur: { joues: number; ppm: number };
  formeRecente: Issue[];
  serie: { type: TypeSerie; longueur: number } | null;
  clubId: string;
}

export interface Piste {
  ton: "atout" | "vigilance" | "info";
  importance: 1 | 2 | 3;
  titre: string;
  detail: string;
}

export interface RencontreFace {
  matchId: string; date: string | null; journee: string | null; saisonId?: string | null;
  domicile: boolean; bp: number; bc: number; issue: Issue;
}

export interface RapportPrematch {
  genereLe: string;
  monEquipe: ProfilPrematch & { equipeId: string; equipeNom: string; clubNom: string };
  adversaire: ProfilPrematch & { equipeId: string | null; clubNom: string };
  championnat: { competition: string | null; poule: string | null; saisonNom: string | null; saisonActive: boolean };
  match: { id: string; date: string | null; heure: string | null; journee: string | null; terrain: string | null; domicile: boolean } | null;
  faceAFace: { rencontres: RencontreFace[]; bilan: Bilan };
  analyse: null | {
    matchsAnalyses: number;
    scoreDanger: number;
    scoreChaos: number;
    fatigueMoy: number | null;
    entraineur: string | null;
    insights: Insight[];
    compoProbable: { poste: string; numero?: number; nom: string; matchsJoues: number }[];
    joueursCles: { joueurId: string | null; nom: string; prenom?: string; poste?: string; delta: number; matchsAvec: number; titularisations: number }[];
    faiblesses: { niveau: string; titre: string; detail: string }[];
    avertis: { nom: string; jaunes: number; rouges: number }[];
    discipline: { jaunes: number; rouges: number; jaunesParMatch: number; partFinDeMatch: number | null };
    changementsMoyenne: number;
  };
  arbitre: null | {
    nom: string; profil: string | null; matchsPrincipal: number;
    cartonsJaunes: number; cartonsRouges: number; cartonsParMatch: number; motifsTop: string | null;
  };
  pistes: Piste[];
}
