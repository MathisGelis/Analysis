// src/features/direct/lib/bilan-types.ts
//
// Le bilan de mi-temps que renvoie l'API (voir foot-analytics-api/src/features/analyse-jeu/bilan-mi-temps.ts).

export interface LigneBilan { cle: string; libelle: string; nous: number; eux: number }
export interface JoueurABilan { nom: string; numero: number | null; buts: number; fautes: number; jaunes: number; rouges: number }
export interface PisteMiTemps { ton: "bon" | "alerte" | "neutre"; titre: string; detail: string; piste?: string }

export interface BilanMiTemps {
  disponible: boolean;
  score: { nous: number; eux: number };
  lignes: LigneBilan[];
  couloirConcede: { nom: string; part: number } | null;
  joueurs: JoueurABilan[];
  pistes: PisteMiTemps[];
}
