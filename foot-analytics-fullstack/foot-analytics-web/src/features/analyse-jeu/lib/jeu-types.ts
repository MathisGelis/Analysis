// src/features/analyse-jeu/lib/jeu-types.ts
//
// Ce que renvoie l'API des analyses du jeu (voir foot-analytics-api/src/features/analyse-jeu).

export interface LigneStat { cle: string; libelle: string; nous: number; eux: number }
export interface Constat { id: string; titre: string; detail: string; ton: "bon" | "alerte" | "neutre" }

export interface ResumeMatch {
  nousCote: "dom" | "ext";
  score: { nous: number; eux: number };
  sources: { detail: boolean; fmi: boolean };
  stats: LigneStat[];
  conversion: { nous: number | null; eux: number | null };
  tranches: { nom: string; nous: number; eux: number }[];
  butsSource: "direct" | "fmi" | "aucune";
  /** 15 zones, ligne par ligne : tiers offensif d'abord, puis median, puis defensif ; 5 couloirs de gauche a droite. */
  carte: { tirs: number[]; buts: number[] };
  contextes: { nom: string; tirs: number; buts: number }[];
  constats: Constat[];
}

/* ---- Le jeu de l'equipe sur plusieurs matchs (analyse-jeu/jeu-equipe.ts) ---- */
export type Lieu = "tous" | "domicile" | "exterieur";
export type Famille = "Jeu placé" | "Transition" | "Coup de pied arrêté" | "Autre";
export interface CarteZones { tirs: number[]; buts: number[] }
export interface TotalCote { tirs: number; cadres: number; buts: number }
export interface PourContre { pour: number; contre: number }

export interface JeuEquipe {
  couverture: { matchs: number; saisis: number; butsDates: number; avecCartons: number };
  buts: { pour: number[]; contre: number[]; matchsCouverts: number; total: PourContre };
  tirs: null | {
    matchs: number; pour: TotalCote; contre: TotalCote; parMatch: PourContre;
    conversion: { pour: number | null; contre: number | null }; cadresPct: { pour: number | null; contre: number | null };
    carte: { pour: CarteZones; contre: CarteZones };
    contextes: { nom: string; famille: Famille; tirs: number; buts: number }[];
    familles: { famille: Famille; tirs: number; buts: number }[];
  };
  discipline: null | {
    matchsSaisis: number; matchsCartons: number;
    fautes: PourContre; horsJeux: PourContre; corners: PourContre; coupsFrancs: PourContre; penaltys: PourContre; arrets: PourContre; jaunes: PourContre; rouges: PourContre;
  };
  matchs: { matchId: string; date: string | null; domicile: boolean; adversaireId: string | null; bp: number; bc: number; saisi: boolean; tirs: number | null; cadres: number | null; formation: string | null }[];
}

export interface ReponseJeu { filtres: { equipeId?: string; saisonId?: string; lieu: Lieu; derniers: number | null }; matchsDeLaSaison: number; jeu: JeuEquipe }
export interface ReponseAdversaire { adversaireId: string; matchsContreNous: number; jeu: JeuEquipe }

export type Force = "forte" | "moyenne" | "faible" | "nulle";
export interface Croisements {
  suffisant: boolean; minimum: number;
  danger: null | {
    mesure: { scoreDanger: number; butsParMatch: number; matchs: number };
    reel: { matchs: number; tirsParMatch: number; cadresPct: number | null; conversion: number | null; butsParMatch: number };
    serie: { matchId: string; date: string | null; tirs: number; cadres: number; buts: number; ecart: number }[];
    tendance: null | { debut: number; fin: number; sens: "hausse" | "baisse" | "stable" };
    lecture: string[];
  };
  joueurs: { joueurId: string; nom: string; impactPondere: number; delta: number; matchs: number; buts: number; passes: number; tirs: number; conversion: number | null; lecture: "impact_sans_production" | "production_sans_impact" | "coherent" }[];
  facteurs: { id: string; facteur: string; mesure: string; n: number; r: number | null; force: Force | null; lecture: string }[];
  dispositifs: { formation: string; matchs: number; saisis: number; butsPourParMatch: number; butsContreParMatch: number; pointsParMatch: number; tirsParMatch: number | null; conversion: number | null; echantillonFaible: boolean }[];
  familles: { famille: Famille; tirs: number; buts: number; conversion: number | null; part: number }[];
}
export interface ReponseCroisements { filtres: ReponseJeu["filtres"]; couverture: JeuEquipe["couverture"]; croisements: Croisements; fatigueMoy: number | null }
