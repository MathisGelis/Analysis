// Types du domaine — alignes sur le schema Supabase (supabase/schema.sql).

export type Issue = "V" | "N" | "D";

export interface Club {
  id: string;
  numeroFff?: string;
  nom: string;
  ville?: string;
  abbr: string;
  couleur: string;
}

export interface Equipe {
  id: string;
  clubId: string;
  nom: string;
  categorie?: string | null;
  division?: string | null;
  poule?: string | null;
  competitionLibelle?: string | null;
  saisonId?: string | null;
  coach?: string;
  formationDef?: string | null;
}

export interface Saison {
  id: string;
  nom: string;
  anneeDebut: number;
  actif: boolean;
  statut?: string;
}

/** Compteurs d'un joueur sur une saison (ou une equipe de cette saison). */
export interface TotauxSaison {
  matchs: number;
  titularisations: number;
  minutes: number;
  buts: number;
  passesDecisives: number;
  cartonsJaunes: number;
  cartonsRouges: number;
  /** Numeros portes : { "6": 3, "8": 5 }. */
  numeros: Record<string, number>;
  noteMoyenne: number | null;
}

/** Une ligne (equipe) du parcours d'un joueur pour une saison. */
export interface LigneHistorique {
  clubId: string;
  equipeId: string | null;
  equipeNom: string | null;
  competitionLibelle: string | null;
  poule: string | null;
  matchs: number;
  titularisations: number;
  minutes: number;
  buts: number;
  passesDecisives: number;
  cartonsJaunes: number;
  cartonsRouges: number;
  noteMoyenne: number | null;
  numeros: Record<string, number>;
}

/** Parcours d'un joueur pour une saison : `GET /joueurs/:id/historique`. */
export interface HistoriqueSaison {
  saisonId: string | null;
  saisonNom: string;
  anneeDebut: number;
  saisonActive: boolean;
  totaux: TotauxSaison;
  lignes: LigneHistorique[];
}

/** Un match joue par le joueur : `GET /joueurs/:id/matchs`. */
export interface MatchJoue {
  matchId: string;
  date: string | null;
  journee: string | null;
  clubId: string;
  adversaireId: string;
  domicile: boolean;
  scoreEquipe: number;
  scoreAdversaire: number;
  titulaire: boolean;
  minutes: number;
  numero: number | null;
  buts: number;
  passesDecisives: number;
  cartonsJaunes: number;
  cartonsRouges: number;
}

export interface Joueur {
  id: string;
  licence?: string;
  nom: string;
  prenom: string;
  clubId: string;
  poste?: string;
  numeroFavori?: number | null;
  statutMutation?: string;
  dateNaissance?: string;
  // statistiques agregees (saison)
  matchs: number;
  titularisations: number;
  minutes: number;
  cartonsJaunes: number;
  cartonsRouges: number;
  noteMoyenne?: number;
  // Score de FATIGUE 0-100 (bas = frais, haut = surcharge) : charge d'entrainement + charge en match
  // + congestion + antecedents. Recalcule a chaque lecture cote API (common/fatigue.ts).
  scoreFatigue?: number | null;
  // Decomposition du score (JSON) : voir lib/fatigue.ts (lireDetailFatigue).
  fatigueDetail?: string | null;
  acwr?: number | null;
  chargeAcute7j?: number | null;
  chargeChronic28j?: number | null;
  postes?: string;           // ex. "5 (18) / R (3)"
  commentaire?: string;
  // saisis manuellement depuis la vue Effectif (mon club).
  buts?: number;
  passesDecisives?: number;
  // historique de blessures (alimente par la derivation backend).
  blessuresAnt?: number;
  // donnees morphologiques (saisie manuelle, mon effectif).
  tailleCm?: number;
  poidsKg?: number;
  piedFort?: "droit" | "gauche" | "ambidextre";
  // Profil derive des motifs de cartons.
  typeDiscipline?: string | null;
  // Score de discipline 0-100 calcule cote backend (100 = irreprochable).
  // Pondere CJ vs CR et par motif (brutalite/antisport/contestation/faute).
  scoreDiscipline?: number | null;
}

export interface Arbitre {
  id: string;
  nom: string;
  prenom?: string;
  matchsOfficies: number;
  cartonsJaunesDonnes: number;
  cartonsRougesDonnes: number;
  profil?: "Permissif" | "Standard" | "Strict" | null;
  motifsTop?: string | null;
  noteMoyenne?: number | null;
}

export interface ArbitreMatch {
  id: string;
  matchId: string;
  arbitreId: string;
  role: "principal" | "assistant1" | "assistant2" | "4e" | "autre";
  note?: number | null;
  arbitre?: Arbitre;
}

/** Plan de jeu enregistre d'une equipe (dispositif, onze, remplacants). */
export interface TactiquePlan {
  id: string;
  equipeId: string;
  matchId: string | null;
  formation: string;
  /** 11 cases dans l'ordre des postes du terrain : id du joueur, "" = poste vide. */
  titulaires: string[];
  remplacants: string[];
  capitaineId: string | null;
  notes: string | null;
  modifieLe: string;
}

export interface EvenementMatch {
  type: "carton" | "carton_vert" | "but" | "remplacement" | "blessure";
  sousType?: string;         // jaune|rouge / type but / localisation
  motif?: string;
  minute: number;
  arret: number;
  joueur: string;            // nom affiche
  joueur2?: string;          // entrant / passeur
  equipe: "dom" | "ext";
}

export interface CompoLigne {
  numero: number;
  nom: string;
  prenom: string;
  licence?: string;
  titulaire: boolean;
  capitaine: boolean;
  poste?: string;            // coordonnee tactique optionnelle
}

export interface Match {
  id: string;
  numeroFmi?: string;
  journee: string;
  date: string;
  heure?: string;
  competition: string;
  poule?: string;
  terrain?: string;
  clubDom: string;           // id club
  clubExt: string;
  equipeDomId?: string | null;
  equipeExtId?: string | null;
  saisonId?: string | null;
  scoreDom: number;
  scoreExt: number;
  arbitre?: string;
  formationDom: string;
  formationExt: string;
  statut: "joue" | "a_venir" | "arrete";
  compoDom?: CompoLigne[];
  compoExt?: CompoLigne[];
  // Forme renvoyee par le backend : liste plate avec un champ `cote`.
  compositions?: (CompoLigne & { cote?: "dom" | "ext" })[];
  evenements?: EvenementMatch[];
}

export interface MatchResultat {
  journee: string;
  lieu: "Domicile" | "Extérieur";
  adversaire: string;
  advClub?: string;
  butsMarques: number;
  butsEncaisses: number;
  cartonsJaunes: number;
  cartonsRouges: number;
}

export interface RapportScouting {
  id: string;
  clubId: string;
  equipeNom: string;
  auteur: string;
  date: string;
  classement: string;
  points: number;
  bilan: string;
  bilanDom: string;
  bilanExt: string;
  butsMarques: number;
  butsEncaisses: number;
  cartonsJaunes: number;
  cartonsRouges: number;
  dispositifAttendu: string;
  commentaires: string;
  capitaine: string;
  joueursSuspendus: string[];
  joueursCles: string[];
  forces: string[];
  faiblesses: string[];
  resultats: MatchResultat[];
  dernier11: { numero: number; nom: string; prenom: string; note?: string | null }[];
}

export interface LigneClassement {
  clubId: string;
  /** Equipe classee (null sur les lignes anciennes, au niveau club). */
  equipeId?: string | null;
  saisonId?: string | null;
  rang: number;
  joues: number;
  v: number;
  n: number;
  d: number;
  bp: number;
  bc: number;
  pts: number;
  forme: Issue[];
}
