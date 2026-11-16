// src/features/apres-match/lib/apres-types.ts
//
// Ce que renvoie l'API de l'apres-match (voir foot-analytics-api/src/features/apres-match).

import type { StatutDirect } from "@/features/direct/lib/direct-types";

export interface Faits { buts: number; passes: number; arrets: number; tirs: number; jaunes: number; rouges: number }

export interface JoueurApres {
  id: string; nom: string; prenom: string | null; poste: string | null; numero: number | null;
  role: "titulaire" | "remplacant" | "groupe";
  minutes: number; aJoue: boolean; faits: Faits;
  note: number | null; commentaire: string | null;
}

export interface ArbitreApres { lienId: string; arbitreId: string; nom: string; role: string; libelleRole: string; note: number | null }
export interface BlessureApres { id: string; minute: number; periode: number; joueurId: string | null; joueurNom: string | null; joueurNumero: number | null }
export interface BilanMatch { positifs: string; aTravailler: string; bilan: string }
export interface NoteJoueur { joueurId: string; note: number | null; commentaire: string | null }

export interface EtatApresMatch {
  match: { id: string; clubDom: string; clubExt: string; scoreDom: number | null; scoreExt: number | null; statut: string };
  nousCote: "dom" | "ext";
  statutDirect: StatutDirect | null;
  clotureLe: string | null;
  joueurs: JoueurApres[];
  arbitres: ArbitreApres[];
  blessures: BlessureApres[];
  bilan: BilanMatch;
  avancement: { notes: number; joueurs: number; arbitre: boolean | null; bilan: boolean };
}
