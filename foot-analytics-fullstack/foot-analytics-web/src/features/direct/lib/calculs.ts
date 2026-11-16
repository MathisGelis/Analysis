// src/features/direct/lib/calculs.ts
//
// Score et compteurs recalcules sur l'ecran (memes regles que l'API) : un evenement saisi change le score sans attendre le reseau.

import type { CompteursCote, Cote, EvenementDirect } from "./direct-types";

const QUI_MARQUENT = ["tir", "coup_franc", "penalty"];

export const estBut = (e: Pick<EvenementDirect, "type" | "resultat">): boolean => QUI_MARQUENT.includes(e.type) && e.resultat === "but";

export function score(evenements: Pick<EvenementDirect, "cote" | "type" | "resultat">[]): { dom: number; ext: number } {
  const s = { dom: 0, ext: 0 };
  for (const e of evenements) if (estBut(e)) s[e.cote]++;
  return s;
}

const vide = (): CompteursCote => ({ tirs: 0, tirsCadres: 0, buts: 0, corners: 0, coupsFrancs: 0, penaltys: 0, fautes: 0, horsJeux: 0, arrets: 0, jaunes: 0, rouges: 0 });

export function compteurs(evenements: Pick<EvenementDirect, "cote" | "type" | "resultat">[]): Record<Cote, CompteursCote> {
  const res = { dom: vide(), ext: vide() };
  for (const e of evenements) {
    const c = res[e.cote];
    if (e.type === "tir" || e.type === "coup_franc" || e.type === "penalty") {
      if (e.type === "coup_franc") c.coupsFrancs++;
      if (e.type === "penalty") c.penaltys++;
      if (e.resultat) {
        c.tirs++;
        if (e.resultat === "but" || e.resultat === "cadre" || e.resultat === "arrete") c.tirsCadres++;
        if (e.resultat === "but") c.buts++;
      } else if (e.type === "tir") c.tirs++;
    } else if (e.type === "corner") c.corners++;
    else if (e.type === "faute") c.fautes++;
    else if (e.type === "hors_jeu") c.horsJeux++;
    else if (e.type === "arret") c.arrets++;
    else if (e.type === "carton_jaune") c.jaunes++;
    else if (e.type === "carton_rouge") c.rouges++;
  }
  return res;
}
