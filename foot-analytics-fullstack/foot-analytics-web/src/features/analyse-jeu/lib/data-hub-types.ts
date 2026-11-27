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
  /** Les analyses : dispositifs affrontes, creation, concession, score, rythme, profil. Absent d'une ancienne reponse. */
  analyses?: AnalysesHub;
  /** Le nom des joueurs cites dans les analyses (reseau de passes, dependances). */
  noms?: Record<string, string>;
}

export interface ReponseDataHub {
  filtres: { equipeId?: string; saisonId?: string; lieu: Lieu; derniers: number | null };
  matchsDeLaSaison: number;
  hub: DataHub;
}

export interface StatsJoueurDirect {
  /** Minutes et titularisations dans les matchs saisis (feuille de match) ; null si la feuille de ce joueur n'est pas connue. */
  presence: null | { matchs: number; minutes: number; titularisations: number };
  tranches: { buts: number[]; tirs: number[] };
  familles: { famille: string; tirs: number; buts: number; xg: number }[];
  grosses: { total: number; marquees: number };
  butsCpa: number;
  gardien: null | { matchs: number; tirsCadres: number; arrets: number; butsEncaisses: number; xgCadres: number; butsEvites: number; penaltysSubis: number; penaltysArretes: number; cleanSheets: number };
  joueurId: string; matchs: number; buts: number; passes: number; passesCles: number; tirs: number; cadres: number; xg: number;
  penaltys: { tires: number; marques: number }; coupsFrancs: { tires: number; buts: number };
  corners: number; arrets: number; fautes: number; horsJeux: number; jaunes: number; rouges: number; entrees: number; sorties: number; blessures: number;
  tirsDetail: (TirCarte & { matchId: string })[];
  parMatch: { matchId: string; date: string | null; adversaireId: string | null; adversaire: string; domicile: boolean; bp: number; bc: number;
    minutes: number | null; titulaire: boolean | null; buts: number; passes: number; passesCles: number; tirs: number; cadres: number; xg: number;
    arrets: number; butsEncaisses: number; fautes: number; jaunes: number; rouges: number }[];
}

export interface RangEffectif { cle: "buts" | "passes" | "passesCles" | "tirs" | "xg" | "arrets"; libelle: string; valeur: number; rang: number; sur: number }

export interface ReponseStatsJoueur { saisonId: string | null; matchsDeLaSaison: number; matchsSaisis: number; stats: StatsJoueurDirect; rangs?: RangEffectif[] }

/* ---- Les analyses du Data Hub (analyse-jeu/analyses-hub.ts) ---- */
export type Fiabilite = "faible" | "moyenne" | "bonne";

export interface ConstatHub {
  id: string;
  domaine: "creation" | "concession" | "adversaires" | "score" | "rythme" | "profil";
  ton: "bon" | "alerte" | "neutre";
  titre: string; detail: string; piste?: string; fiabilite: Fiabilite;
}

export interface LigneDispositif {
  formation: string; matchs: number; v: number; n: number; d: number; ptsParMatch: number; bpParMatch: number; bcParMatch: number;
  saisis: number; tirsPour: number; tirsContre: number; xgPour: number; xgContre: number; xgDiffParMatch: number | null;
  conversionAdv: number | null; butsAdvMoinsXg: number | null; fiabilite: Fiabilite;
}

export interface LigneNosDispositifs {
  formation: string; matchs: number; minutes: number; v: number; n: number; d: number; ptsParMatch: number; bpParMatch: number; bcParMatch: number;
  minutesSaisies: number; tirsPour90: number | null; tirsContre90: number | null; xgPour90: number | null; xgContre90: number | null; xgDiff90: number | null; fiabilite: Fiabilite;
}

export interface OccasionsHub {
  tirs: number; buts: number; xg: number;
  zones: { tirs: number[]; buts: number[]; xg: number[]; sansZone: number };
  couloirs: { nom: "gauche" | "axe" | "droite"; tirs: number; xg: number }[];
  familles: { famille: string; tirs: number; buts: number; xg: number }[];
  qualite: { nom: string; tirs: number }[];
  grosses: { total: number; marquees: number };
  reseau: { passeurId: string; tireurId: string; tirs: number; buts: number; xg: number }[];
}

export interface Indicateur { cle: string; libelle: string; saison: number | null; recent: number | null; meilleurSiHaut: boolean; unite: "" | "%" }

export interface AnalysesHub {
  matchsSaisis: number;
  dispositifs: {
    couverture: { avec: number; total: number };
    repartition: { formation: string; matchs: number }[];
    lignes: LigneDispositif[];
    reponses: { adverse: string; nous: string; matchs: number; ptsParMatch: number }[];
  };
  /** Nos dispositifs tenus, au prorata des minutes jouees sous chacun. Absent d'une ancienne reponse. */
  nosDispositifs?: {
    couverture: { avec: number; total: number }; lignes: LigneNosDispositifs[];
    changements: { de: string; vers: string; fois: number }[]; matchsAvecChangement: number;
  };
  creation: OccasionsHub;
  concession: OccasionsHub & { gardien: null | { tirsCadres: number; arrets: number; butsEncaisses: number; xgCadres: number; butsEvites: number } };
  score: {
    matchs: number;
    etats: { etat: "mene" | "egalite" | "mene_par_adv"; minutes: number; tirsPour: number; tirsContre: number; xgPour: number; xgContre: number; xgPour90: number | null; xgContre90: number | null }[];
  };
  rythme: { tirsPour: number[]; tirsContre: number[]; xgPour: number[]; xgContre: number[]; butsPour: number[]; butsContre: number[]; fautes: number[]; cartons: { pour: number[]; contre: number[] } };
  profil: { recents: number; indicateurs: Indicateur[]; radar: { axe: string; saison: 100; recent: number | null }[] };
  dependances: null | {
    buts: number; buteur: { joueurId: string; buts: number; part: number } | null; passeur: { joueurId: string; passes: number; part: number } | null;
    partCpa: number | null; partTransition: number | null;
  };
  constats: ConstatHub[];
}
