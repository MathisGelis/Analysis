// src/common/programme.ts
//
// Rapprochement d'une feuille de match FMI avec un match DEJA PROGRAMME (saisi a la main avant la
// rencontre, statut "prevu"). Sans lui, l'import cree un second match et laisse le premier "a venir"
// pour toujours : le plan de jeu prepare (rattache au match programme) ne serait jamais compare au
// realise. Fonction pure : la requete (memes clubs, meme sens) est faite par l'appelant.

import { parseDateFlexible } from "./periode";

const JOUR = 86_400_000;

/** Statuts d'un match qui n'a pas (encore) de feuille : candidats au rapprochement. */
export const STATUTS_PROGRAMMES = ["prevu", "a_venir", "reporte"] as const;

export interface MatchProgramme {
  id: string;
  date?: string | null;
  statut?: string | null;
  numeroFmi?: string | null;
}

/**
 * Le match programme qui correspond a la feuille jouee le `dateFeuille` : le plus proche en date,
 * a moins de `ecartMaxJours`. Un match "reporte" peut se jouer bien plus tard : il n'a pas de limite.
 * Jamais un match qui a deja sa propre feuille (numero FMI). Date de feuille illisible : null
 * (on prefere un doublon visible a une fusion hasardeuse).
 */
export function choisirProgramme<T extends MatchProgramme>(
  candidats: T[], dateFeuille: string | null | undefined, ecartMaxJours = 45,
): T | null {
  const cible = parseDateFlexible(dateFeuille);
  if (cible === null) return null;
  let meilleur: { m: T; ecart: number } | null = null;
  for (const m of candidats) {
    if (m.numeroFmi) continue;
    if (!(STATUTS_PROGRAMMES as readonly string[]).includes(m.statut ?? "")) continue;
    const d = parseDateFlexible(m.date);
    // Sans date, le match programme reste possible : il ne gagne que faute de mieux.
    const ecart = d === null ? Number.MAX_SAFE_INTEGER : Math.abs(d - cible);
    const limite = m.statut === "reporte" || d === null ? Infinity : ecartMaxJours * JOUR;
    if (ecart > limite) continue;
    if (!meilleur || ecart < meilleur.ecart) meilleur = { m, ecart };
  }
  return meilleur?.m ?? null;
}
