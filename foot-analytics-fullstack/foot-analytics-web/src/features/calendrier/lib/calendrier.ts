// src/features/calendrier/lib/calendrier.ts
//
// Mois affiche a l'ouverture du calendrier. Fonction pure.
//
// Une saison de football court d'aout N a juillet N+1. Ouvrir sur "aujourd'hui"
// n'a de sens que si aujourd'hui est DANS la saison choisie ; sur une saison
// archivee on tombait sur un mois vide, loin de tous les matchs.

import { parseDateMatch } from "@/features/matchs/lib/matchs-equipe";

const premierDuMois = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * - aujourd'hui dans la saison : le mois courant ;
 * - saison terminee : le mois du dernier match, a defaut juin N+1 ;
 * - saison a venir : aout N.
 * Sans saison connue : le mois courant.
 */
export function moisInitial(
  saison: { anneeDebut: number } | null | undefined,
  datesMatchs: (string | null | undefined)[],
  aujourdhui: Date = new Date(),
): Date {
  if (!saison) return premierDuMois(aujourdhui);
  const debut = new Date(saison.anneeDebut, 7, 1);          // 1er aout N
  const fin = new Date(saison.anneeDebut + 1, 7, 1);        // 1er aout N+1 (exclu)

  if (aujourdhui >= debut && aujourdhui < fin) return premierDuMois(aujourdhui);
  if (aujourdhui < debut) return premierDuMois(debut);

  const dernier = datesMatchs
    .map(parseDateMatch)
    .filter((t) => t >= debut.getTime() && t < fin.getTime())
    .sort((a, b) => b - a)[0];
  return dernier ? premierDuMois(new Date(dernier)) : new Date(saison.anneeDebut + 1, 5, 1);
}

/**
 * Date FMI ("31/05/2026") ou ISO ("2026-05-31", avec ou sans heure) en cle
 * "AAAA-MM-JJ", ou null si illisible. Les cellules du calendrier sont
 * indexees par cette cle : sans normalisation, les matchs importes des FMI
 * (JJ/MM/AAAA) ne tombaient jamais dans la bonne case.
 */
export function dateVersIso(s: string | null | undefined): string | null {
  const t = parseDateMatch(s);
  if (!t) return null;
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const jj = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${jj}`;
}
