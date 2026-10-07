// src/features/blessures/periode-blessure.ts
//
// Periode d'une blessure et detection de chevauchement. Fonctions pures.
//
// Convention (alignee sur l'UI) :
//  - retourEstime renseignee : la blessure couvre [dateDebut, retourEstime] ;
//  - sans retourEstime et statut non termine : blessure EN COURS, sans fin ;
//  - sans retourEstime mais statut termine (Retabli...) : un seul jour.

import { parseDateFlexible } from "@/common/dates";

export interface PeriodeBlessure {
  dateDebut?: string | null;
  retourEstime?: string | null;
  statut?: string | null;
}

export function statutTermine(statut?: string | null): boolean {
  const s = (statut ?? "").toLowerCase();
  return s.includes("retabli") || s.includes("guerie") || s.includes("termine");
}

/** Intervalle [debut, fin] en timestamps (fin = Infinity si en cours) ; null si dates inutilisables. */
export function plageBlessure(b: PeriodeBlessure): { debut: number; fin: number } | null {
  const debut = parseDateFlexible(b.dateDebut);
  if (debut == null) return null;
  const retour = parseDateFlexible(b.retourEstime);
  if (retour != null) return { debut, fin: Math.max(debut, retour) };
  return { debut, fin: statutTermine(b.statut) ? debut : Infinity };
}

export function seChevauchent(a: PeriodeBlessure, b: PeriodeBlessure): boolean {
  const pa = plageBlessure(a);
  const pb = plageBlessure(b);
  if (!pa || !pb) return false;
  return pa.debut <= pb.fin && pb.debut <= pa.fin;
}
