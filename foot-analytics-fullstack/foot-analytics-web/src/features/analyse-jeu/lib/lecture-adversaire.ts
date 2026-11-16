// src/features/analyse-jeu/lib/lecture-adversaire.ts
//
// Ce que le jeu d'un adversaire, vu par nos matchs contre lui, permet de dire pour preparer le prochain : quelques constats chiffres,
// seulement quand l'echantillon les justifie. Fonctions pures.

import type { JeuEquipe } from "./jeu-types";

const TIERS = ["Offensif", "Médian", "Défensif"], COULOIRS = ["gauche", "axe gauche", "centre", "axe droit", "droit"];
export const nomZone = (i: number) => `${TIERS[Math.floor(i / 5)]} · ${COULOIRS[i % 5]}`;
const TRANCHES = ["0-15", "15-30", "30-45", "45-60", "60-75", "75-90"];

/** 4 constats au plus, du plus utile au moins utile. `nom` : le nom de l'adversaire. */
export function constatsAdversaire(jeu: JeuEquipe, nom: string): string[] {
  const l: string[] = [];
  const t = jeu.tirs;
  if (t && t.pour.tirs >= 6) {
    const carte = t.carte.pour.tirs, total = carte.reduce((s, x) => s + x, 0);
    if (total >= 6) {
      const i = carte.indexOf(Math.max(...carte));
      const part = Math.round((carte[i] / total) * 100);
      if (part >= 35) l.push(`${nom} tire surtout depuis « ${nomZone(i)} » (${part} % de ses tirs placés) : à fermer en priorité.`);
    }
    const conv = t.conversion.pour;
    if (conv !== null && conv >= 25) l.push(`Efficace devant le but : ${conv} % de conversion sur ${t.pour.tirs} tirs, pour ${t.parMatch.pour} tirs par match.`);
    else if (conv !== null && t.parMatch.pour >= 10) l.push(`Beaucoup de tirs (${t.parMatch.pour} par match) pour peu de buts (${conv} % de conversion) : il se crée des occasions mais finit mal.`);
  }
  const buts = jeu.buts;
  if (buts.matchsCouverts >= 2 && buts.total.pour >= 3) {
    const imax = buts.pour.indexOf(Math.max(...buts.pour));
    const part = Math.round((buts.pour[imax] / buts.total.pour) * 100);
    if (part >= 40) l.push(`${part} % de ses buts tombent entre la ${TRANCHES[imax].replace("-", "e et la ")}e minute.`);
  }
  if (t) {
    const cpa = t.familles.find((f) => f.famille === "Coup de pied arrêté");
    if (cpa && cpa.buts >= 2 && t.pour.buts > 0 && cpa.buts / t.pour.buts >= 0.3) l.push(`${cpa.buts} de ses ${t.pour.buts} buts viennent de coups de pied arrêtés : attention aux corners et aux coups francs.`);
    const placé = t.familles.find((f) => f.famille === "Transition");
    if (placé && placé.buts >= 2 && t.pour.buts > 0 && placé.buts / t.pour.buts >= 0.4) l.push(`${placé.buts} de ses ${t.pour.buts} buts viennent de transitions : ne pas perdre le ballon dans notre moitié de terrain.`);
  }
  const d = jeu.discipline;
  if (d && d.matchsSaisis >= 2 && d.penaltys.pour > 0) l.push(`${d.penaltys.pour} penalty${d.penaltys.pour > 1 ? "s" : ""} obtenu${d.penaltys.pour > 1 ? "s" : ""} contre nous : discipline dans la surface.`);
  return l.slice(0, 4);
}
