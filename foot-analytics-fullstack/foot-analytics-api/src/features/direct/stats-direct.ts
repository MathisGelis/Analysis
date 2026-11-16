// src/features/direct/stats-direct.ts
//
// Ce que l'on calcule des evenements saisis en direct : le score et un petit compteur par equipe. Fonctions pures.
// (Les analyses de la saison : minutes des buts, cartes de tirs, vivront dans leur propre module.)

import { TYPES_QUI_MARQUENT, TypeEvenement } from "./types";

export interface EvenementCalcul {
  cote: "dom" | "ext";
  type: string;
  resultat?: string | null;
}

export const estBut = (e: EvenementCalcul): boolean => (TYPES_QUI_MARQUENT as readonly string[]).includes(e.type) && e.resultat === "but";

export function scoreDirect(evenements: EvenementCalcul[]): { dom: number; ext: number } {
  const score = { dom: 0, ext: 0 };
  for (const e of evenements) if (estBut(e)) score[e.cote]++;
  return score;
}

export interface CompteursCote {
  tirs: number;
  tirsCadres: number;
  buts: number;
  corners: number;
  coupsFrancs: number;
  penaltys: number;
  fautes: number;
  horsJeux: number;
  arrets: number;
  jaunes: number;
  rouges: number;
}

const vide = (): CompteursCote => ({ tirs: 0, tirsCadres: 0, buts: 0, corners: 0, coupsFrancs: 0, penaltys: 0, fautes: 0, horsJeux: 0, arrets: 0, jaunes: 0, rouges: 0 });

/** Un tir compte pour les tirs ; cadre = but ou arrete par le gardien. Un coup franc ou un penalty tire au but compte aussi. */
export function compteurs(evenements: EvenementCalcul[]): { dom: CompteursCote; ext: CompteursCote } {
  const res = { dom: vide(), ext: vide() };
  for (const e of evenements) {
    const c = res[e.cote];
    const t = e.type as TypeEvenement;
    if (t === "tir" || t === "coup_franc" || t === "penalty") {
      if (t === "coup_franc") c.coupsFrancs++;
      if (t === "penalty") c.penaltys++;
      if (e.resultat) {
        c.tirs++;
        if (e.resultat === "but" || e.resultat === "cadre" || e.resultat === "arrete") c.tirsCadres++;
        if (e.resultat === "but") c.buts++;
      } else if (t === "tir") c.tirs++;
    } else if (t === "corner") c.corners++;
    else if (t === "faute") c.fautes++;
    else if (t === "hors_jeu") c.horsJeux++;
    else if (t === "arret") c.arrets++;
    else if (t === "carton_jaune") c.jaunes++;
    else if (t === "carton_rouge") c.rouges++;
  }
  return res;
}
