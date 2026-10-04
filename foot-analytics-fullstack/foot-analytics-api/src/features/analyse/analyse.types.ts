// src/features/analyse/analyse.types.ts

import { AnalyseNumeros } from "./compo-numeros";
import { Issue, SensTendance, Tendances } from "./tendances";

/* ---------- types de sortie (consommes tels quels cote front) ---------- */
export interface RapportEquipe {
  clubId: string;
  clubNom: string;
  matchsAnalyses: number;
  // KPI haut de page
  scoreDanger: number;        // 0-100, plus haut = equipe dangereuse
  scoreChaos: number;         // 0-100, plus haut = equipe instable
  fatigueMoy: number | null;  // fatigue moyenne des titulaires types (0-100, haut = fatigue) ; null hors saison active ou sans donnee
  // Ce que le rapport couvre (equipe, saison, poule) : la page l'affiche en en-tete.
  perimetre: {
    equipeId: string | null; equipeNom: string | null;
    saisonId: string | null; saisonNom: string | null; saisonActive: boolean;
    competition: string | null; poule: string | null;
  };
  // Tendances : dynamique recente, series, lieux, profil, discipline, rotation, constats.
  tendances: Tendances;
  // Impact / joueurs cles
  impacts: ImpactJoueur[];    // un par joueur, trie par impact decroissant
  joueursCles: ImpactJoueur[];// top par impactPondere, min 50% des matchs
  impactsFaibles: ImpactJoueur[]; // joueurs reguliers a faible impact
  // Stabilite par ligne et global
  stabilite: {
    global: number;
    parLigne: { ligne: string; stabilite: number; effectifUtilise: number; rotations: number }[];
  };
  // Faiblesses identifiees
  faiblesses: Faiblesse[];
  // Compo probable : un joueur par numero de maillot (poste : voir features/matchs/numeros-postes.ts) quand les numeros
  // sont exploitables, sinon les 11 titulaires les plus utilises. `compoProbableSur` : le nombre de matchs sur lequel
  // portent les titularisations (les feuilles recentes pour les numeros, tous les matchs analyses sinon).
  compoProbable: { poste: string; numero?: number; nom: string; matchsJoues: number }[];
  compoProbableSur: number;
  // Ce que disent les numeros de maillot : postes, polyvalence, indices de systeme (changements de numero).
  numeros: AnalyseNumeros;
  // Meilleurs buteurs de l'equipe sur le perimetre (hors contre son camp), du plus au moins prolifique.
  buteurs: { nom: string; buts: number }[];
  // Partnerships (combinaisons recurrentes)
  partnerships: Partnership[];
  // Minute moyenne des changements
  changementsMoy: {
    moyenne: number;
    parTypeMatch: { type: "victoire" | "nul" | "defaite"; moyenne: number; nbChangements: number }[];
    nbChangementsAvant60: number;
  };
  // Joueurs les plus avertis de l'equipe (cartons recus sur le perimetre), du plus au moins averti.
  avertis: { nom: string; jaunes: number; rouges: number }[];
  // Stats sur le staff (coachs / dirigeants) presents sur les FMI.
  coachs: CoachStat[];
  changementsCoach: { date: string; journee?: string; avant: string; apres: string }[];
}

interface CoachStat {
  coachId: string;
  nom: string;
  prenom?: string;
  licence?: string;
  matchsPresent: number;
  v: number; n: number; d: number;
  txReussite: number;
  cartonsJaunes: number;
  cartonsRouges: number;
  fonctions: string;             // "E (5) · D (1)"
  fonctionPrincipale: string | null;  // "Entraineur", "Adjoint", "Medecin", "Dirigeant"
  premierMatch: string | null;
  dernierMatch: string | null;
}
export interface ImpactJoueur {
  joueurId: string | null;
  nom: string;
  prenom?: string;
  poste?: string;
  matchsAvec: number;
  matchsSans: number;
  pointsParMatchAvec: number;
  pointsParMatchSans: number;
  delta: number;           // ppm avec - ppm sans
  // Impact pondere par le nombre de matchs joues : ainsi un joueur qui
  // n'a joue qu'un seul match victorieux ne ressort pas comme "cle" alors
  // qu'il a un delta enorme mais sur 1 seul echantillon.
  impactPondere: number;
  diffParMatchAvec: number;
  diffParMatchSans: number;
  titularisations: number;
}
export interface Faiblesse {
  niveau: "info" | "alerte" | "critique";
  titre: string;
  detail: string;
}
export interface Partnership {
  type: "defense" | "milieu" | "attaque";
  joueurs: string[];
  matchsEnsemble: number;
  v: number; n: number; d: number;
  txReussite: number;       // % victoires
  bp: number; bc: number;
}

/** Une ligne de la dynamique de poule. */
export interface DynamiqueEquipe {
  equipeId: string;
  clubId: string;
  nom: string;
  rang: number | null;
  pts: number | null;
  joues: number;
  /** 5 derniers resultats, du plus ancien au plus recent. */
  formeRecente: Issue[];
  ppmSaison: number;
  ppmRecent: number;
  ecartPpm: number;
  sens: SensTendance;
  attaque: SensTendance;
  defense: SensTendance;
  score: number | null;
  libelle: string;
  serie: { type: string; longueur: number } | null;
}
