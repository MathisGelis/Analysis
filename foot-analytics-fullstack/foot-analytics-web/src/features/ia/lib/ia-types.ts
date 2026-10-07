// src/features/ia/lib/ia-types.ts
//
// Formes des reponses de l'API /ia (features/ia cote serveur) : entrainements, modeles, resultats.

export type Methode = "modele" | "dernier" | "moteur" | "frequence";
export type Mesure = "onze" | "postes";

export interface Hyper { fenetre: number; l2: number; demiVie: number | null }

export interface ResumeNote { n: number; onze: number | null; postes: number | null; nPostes: number; parfaits: number }
export type NotesParMethode = Record<Methode, ResumeNote>;

export interface PointCourbe {
  etape: number;
  libelle: string;
  journees: string;
  n: number;
  modele: { onze: number | null; postes: number | null };
  dernier: { onze: number | null; postes: number | null };
  moteur: { onze: number | null; postes: number | null };
  frequence: { onze: number | null; postes: number | null };
  perte: number | null;
}

export interface ErreurFeuille {
  matchId: string;
  etape: number;
  date: string;
  journee: string | null;
  equipe: string;
  adversaire: string;
  domicile: boolean;
  onze: number;
  manques: { nom: string; proba: number | null }[];
  fauxPositifs: { nom: string; proba: number }[];
}

export interface JoueurDifficile {
  nom: string;
  equipe: string;
  matchs: number;
  probaMoyenne: number;
  titularisations: number;
  perteMoyenne: number;
}

export interface ResumeSysteme {
  n: number;
  modele: { top1: number | null; top3: number | null; defense: number | null };
  moteur: { top1: number | null; top3: number | null; defense: number | null };
  dernier: { top1: number | null; top3: number | null; defense: number | null };
  frequent: { top1: number | null; top3: number | null; defense: number | null };
}

export interface BandeCalibration { de: number; a: number; n: number; probaMoyenne: number | null; tauxObserve: number | null }

export interface Poids { noms: string[]; w: number[] }

export interface PoidsIa {
  version: 1;
  hyper: Hyper;
  titularisation: Poids;
  numeros: Poids;
  systeme: Poids | null;
  /** Le dispositif appris sert en direct s'il a fait au moins aussi bien que le moteur a regles (absent : non verifie). */
  systemeRetenu?: boolean;
  frequencesSysteme: Record<string, number>;
}

export interface ResumeDonnees {
  matchsLus: number;
  feuilles: number;
  etapes: number;
  equipes: number;
  premiere: string | null;
  derniere: string | null;
  derniereSemaine: number | null;
  saisons: string[];
  ecartes: { sansDate: number; sansFeuille: number; feuilleIncomplete: number; horsSaison: number };
}

export interface ResultatEntrainement {
  hyper: Hyper;
  perte: number | null;
  poids: PoidsIa;
  global: NotesParMethode;
  recent: NotesParMethode;
  courbe: PointCourbe[];
  parSaison: Record<string, NotesParMethode>;
  nouveaux: number | null;
  sansHistorique: number;
  systeme: ResumeSysteme | null;
  comparaison: ComparaisonActif | null;
  calibration: BandeCalibration[];
  pires: ErreurFeuille[];
  difficiles: JoueurDifficile[];
  alertes: string[];
  donnees: ResumeDonnees;
  saisons?: Record<string, string>;
  essais: { hyper: Hyper; perte: number | null; onze: number | null; postes: number | null }[];
  dureeMs: number;
}

export interface ResumeModele {
  hyper: Hyper;
  feuilles: number;
  semaines: number;
  predictions: number;
  onze: number | null;
  postes: number | null;
  referenceOnze: number | null;
  reference: Exclude<Methode, "modele"> | null;
  perte: number | null;
  systemeAppris: boolean;
  /** Le dispositif appris sert en direct avec ce modele. */
  systemeRetenu: boolean;
  derniereSemaine: number | null;
}

export type StatutEntrainement = "en_cours" | "termine" | "echec" | "annule";
/** manuel : lance par un administrateur ; auto : le reentrainement hebdomadaire. */
export type Declencheur = "manuel" | "auto";

export interface MesureComparaison { onze: number | null; postes: number | null; perte: number | null }

/** Le nouveau modele face au modele actif, sur les semaines posterieures a celles que l'actif avait vues. */
export interface ComparaisonActif {
  actif: { id: string; nom: string };
  depuis: string;
  semaines: number;
  feuilles: number;
  nouveau: MesureComparaison;
  ancien: MesureComparaison;
}

/**
 * remplace : au moins aussi bon que l'actif ; conserve : l'actif reste (moins bon, ou comparaison impossible) ;
 * sans_actif : aucun modele actif ; inchange : rien de nouveau.
 */
export type ActionDecision = "remplace" | "conserve" | "sans_actif" | "inchange";

export interface Decision {
  action: ActionDecision;
  raison: string;
  /** Vrai : le modele actif a ete remplace (seulement pour un entrainement automatique). */
  appliquee: boolean;
  comparaison: ComparaisonActif | null;
}

export interface ModeleListe { id: string; nom: string; entrainementId: string; resume: ResumeModele; actif: boolean; creeLe: string }

export interface EntrainementResume {
  id: string;
  statut: StatutEntrainement;
  progression: number;
  message: string | null;
  options: { optimiser: boolean; saisonIds: string[] | null };
  lancePar: string | null;
  modeleId: string | null;
  termineLe: string | null;
  creeLe: string;
  declencheur: Declencheur;
  decision: Decision | null;
  modele: { id: string; nom: string; actif: boolean; resume: ResumeModele } | null;
}

export interface Caracteristique { id: string; libelle: string; aide: string }

export interface EntrainementDetail extends EntrainementResume {
  resultat: ResultatEntrainement | null;
  poidsInitiaux: PoidsIa;
  catalogue: { titularisation: Caracteristique[]; numeros: Caracteristique[]; systeme: Caracteristique[] };
}

/** Le reentrainement automatique : chaque semaine, a `jour` (0 = dimanche) et `heure`, heure de `fuseau`. */
export interface PlanningIa {
  actif: boolean;
  depuis: string;
  /** Le planificateur tourne-t-il sur ce serveur ? */
  operationnel: boolean;
  jour: number;
  heure: number;
  fuseau: string;
  prochain: string | null;
  dernier: EntrainementResume | null;
}

export interface EtatIa {
  actif: ModeleListe | null;
  enCours: EntrainementResume | null;
  dernier: EntrainementResume | null;
  planning: PlanningIa;
  donnees: { matchsJoues: number; saisons: { id: string; nom: string; matchs: number }[] };
}
