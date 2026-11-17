// src/features/direct/lib/direct-types.ts
//
// Ce que l'API du direct renvoie (voir foot-analytics-api/src/features/direct) et le vocabulaire des actions.

export type Cote = "dom" | "ext";

export type TypeAction =
  | "tir" | "arret" | "corner" | "coup_franc" | "penalty" | "faute" | "hors_jeu" | "carton_jaune" | "carton_rouge" | "remplacement" | "blessure";

export type StatutDirect = "avant" | "en_cours" | "pause" | "mi_temps" | "termine";
export type ActionChrono = "demarrer" | "pause" | "reprendre" | "mi_temps" | "deuxieme_periode" | "fin" | "corriger";

export interface EvenementDirect {
  id: string;
  cote: Cote;
  type: TypeAction;
  resultat: string | null;
  periode: number;
  minute: number;
  joueurNumero: number | null;
  joueurNom: string | null;
  joueurId: string | null;
  joueur2Numero: number | null;
  joueur2Nom: string | null;
  joueur2Id: string | null;
  zoneTier: number | null;
  zoneCouloir: number | null;
  zoneCadre: number | null;
  contextes: string[];
  /** Fabrique par le serveur ; absent tant que l'evenement n'a pas fait l'aller-retour. */
  minuteAffichee?: string;
  creeLe?: string;
}

/** L'evenement tel qu'on l'envoie : tout sauf ce que le serveur ajoute. */
export type SaisieEvenement = Omit<EvenementDirect, "minuteAffichee" | "creeLe">;

export interface JoueurDirect {
  id: string;
  nom: string;
  prenom: string | null;
  poste: string | null;
  numero: number | null;
  role: "titulaire" | "remplacant" | "groupe";
}

export interface ChronoDirect {
  statut: StatutDirect;
  periode: number;
  accumuleMs: number;
  demarreLe: number | null;
  dureePeriodeMin: number;
  minute: number;
  clotureLe: string | null;
  serveurMs: number;
}

export interface CompteursCote {
  tirs: number; tirsCadres: number; buts: number; corners: number; coupsFrancs: number; penaltys: number;
  fautes: number; horsJeux: number; arrets: number; jaunes: number; rouges: number;
}

export interface EtatDirect {
  match: {
    id: string; clubDom: string; clubExt: string; nomDom: string; nomExt: string; equipeDomId: string | null; equipeExtId: string | null;
    date: string | null; heure: string | null; journee: string | null; competition: string | null; numeroFmi: string | null; statut: string;
  };
  nousCote: Cote;
  chrono: ChronoDirect;
  evenements: EvenementDirect[];
  score: { dom: number; ext: number };
  compteurs: { dom: CompteursCote; ext: CompteursCote };
  joueurs: JoueurDirect[];
  /** Present seulement quand le direct est lu par un saisisseur invite. */
  invitation?: { libelle: string; peutChrono: boolean; expireLe: string };
  /** L'avant-match de ce match est-il fait (onze enregistre pour ce match) ? Sinon le staff est renvoye vers l'avant-match. */
  avantMatch?: { pret: boolean; titulaires: number; banc: number; possible: boolean };
}

/* ---- Invitations a saisir ---- */
export interface InvitationVue {
  id: string; libelle: string; peutChrono: boolean; expireLe: string; ouvertLe: string | null; revoqueLe: string | null;
  derniereActiviteLe: string | null; creeLe: string; etat: "en_attente" | "ouverte" | "expiree" | "revoquee";
}
export interface InvitationCreee { invitation: InvitationVue; jeton: string }
