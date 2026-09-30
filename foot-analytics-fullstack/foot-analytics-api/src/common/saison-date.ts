// src/common/saison-date.ts
//
// Saison sportive d'une date : du 1er juillet au 30 juin. Une seule regle,
// partagee par la creation automatique des saisons (import FMI, backfill) et
// par les vues qui rattachent un document date (rapport de scouting) a une saison.

import { parseDateFlexible } from "./periode";

/** Annee de debut de la saison qui contient cette date ("2026-03-15" ou "15/03/2026"), null si illisible. */
export function anneeDebutPourDate(date?: string | null): number | null {
  const ts = parseDateFlexible(date);
  if (ts == null) return null;
  const d = new Date(ts);
  return d.getUTCMonth() + 1 >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** Nom de saison ("2025-2026") pour une annee de debut. */
export function nomSaison(anneeDebut: number): string {
  return `${anneeDebut}-${anneeDebut + 1}`;
}

/** La date tombe-t-elle dans la saison commencee en `anneeDebut` ? null si la date est illisible. */
export function dateDansSaison(date: string | null | undefined, anneeDebut: number): boolean | null {
  const annee = anneeDebutPourDate(date);
  return annee == null ? null : annee === anneeDebut;
}
