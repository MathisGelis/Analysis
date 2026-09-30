// src/common/periode.ts
//
// Periode d'une blessure et detection de chevauchement. Fonctions pures.
//
// Convention (alignee sur l'UI) :
//  - retourEstime renseignee : la blessure couvre [dateDebut, retourEstime] ;
//  - sans retourEstime et statut non termine : blessure EN COURS, sans fin ;
//  - sans retourEstime mais statut termine (Retabli...) : un seul jour.

export interface PeriodeBlessure {
  dateDebut?: string | null;
  retourEstime?: string | null;
  statut?: string | null;
}

/** Parse "2026-03-15" ou "15/03/2026" (ou "-") en timestamp UTC, sinon null. */
export function parseDateFlexible(s?: string | null): number | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const fr = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (fr) {
    const annee = +fr[3] < 100 ? 2000 + +fr[3] : +fr[3];
    return Date.UTC(annee, +fr[2] - 1, +fr[1]);
  }
  return null;
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
