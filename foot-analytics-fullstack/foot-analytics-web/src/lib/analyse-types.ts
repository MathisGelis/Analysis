// src/lib/analyse-types.ts
//
// Forme des reponses de GET /analyse/club/:clubId et GET /analyse/poule. Miroir des
// types de foot-analytics-api/src/common/tendances.ts (le serveur reste la source).

export type Issue = "V" | "N" | "D";
export type SensTendance = "hausse" | "baisse" | "stable" | "insuffisant";
export type TypeSerie =
  | "victoires" | "invaincu" | "defaites" | "sans_victoire" | "sans_encaisser" | "sans_marquer" | "marque";

export interface Bilan {
  joues: number; v: number; n: number; d: number;
  pts: number; ppm: number; bp: number; bc: number; bpm: number; bcm: number;
}

export interface PointCourbe {
  matchId: string; journee: string | null; date: string | null;
  issue: Issue; domicile: boolean; bp: number; bc: number; adversaireId: string | null;
  ptsCumules: number; ppmGlissant: number; bpGlissant: number; bcGlissant: number;
}

export interface DynamiqueForme {
  fenetre: number;
  saison: Bilan; recente: Bilan; avant: Bilan;
  sens: SensTendance;
  ecartPpm: number; ecartBpm: number; ecartBcm: number;
  attaque: SensTendance; defense: SensTendance;
  score: number | null;
  libelle: string;
}

export interface Serie { type: TypeSerie; longueur: number }

export interface Insight {
  id: string;
  ton: "positif" | "negatif" | "neutre";
  categorie: "forme" | "attaque" | "defense" | "domicile" | "discipline" | "effectif" | "adversaires";
  importance: 1 | 2 | 3;
  titre: string;
  detail: string;
}

export interface Tendances {
  matchs: number;
  courbe: PointCourbe[];
  forme: DynamiqueForme;
  series: { enCours: Serie[]; records: Serie[] };
  lieux: { domicile: Bilan; exterieur: Bilan; ecartPpm: number | null };
  profil: {
    matchs: number; matchsSansEncaisser: number; matchsSansMarquer: number; matchsSerres: number;
    recordMatchsSerres: Bilan; grossesVictoires: number; grossesDefaites: number;
  };
  moities: { premiere: Bilan; seconde: Bilan; ecartPpm: number } | null;
  discipline: {
    jaunes: number; rouges: number; jaunesParMatch: number;
    recentJaunesParMatch: number; avantJaunesParMatch: number; ecartJaunes: number;
    parTranche: number[]; cartonsAvecMinute: number; partFinDeMatch: number | null;
  };
  butsParTranche: { disponible: boolean; couverture: number; pour: number[]; contre: number[] };
  rotation: { changements: (number | null)[]; moyenne: number; recente: number; avant: number; sens: SensTendance };
  parNiveau: { niveau: "haut" | "milieu" | "bas"; rangs: string; bilan: Bilan }[] | null;
  insights: Insight[];
}

export interface DynamiqueEquipe {
  equipeId: string; clubId: string; nom: string;
  rang: number | null; pts: number | null; joues: number;
  formeRecente: Issue[];
  ppmSaison: number; ppmRecent: number; ecartPpm: number;
  sens: SensTendance; attaque: SensTendance; defense: SensTendance;
  score: number | null; libelle: string;
  serie: { type: TypeSerie; longueur: number } | null;
}

export interface DynamiquePoule {
  equipeId: string; saisonId: string | null;
  competition: string | null; poule: string | null;
  equipes: DynamiqueEquipe[];
}

/** Ce que le rapport couvre : l'equipe, la saison, le championnat. */
export interface PerimetreRapport {
  equipeId: string | null; equipeNom: string | null;
  saisonId: string | null; saisonNom: string | null; saisonActive: boolean;
  competition: string | null; poule: string | null;
}

export interface StabiliteRapport {
  global: number;
  parLigne: { ligne: string; stabilite: number; effectifUtilise: number; rotations: number }[];
}
