// src/common/dates.ts
//
// Dates des feuilles de match et du calendrier : "2026-03-15" (ISO) ou "15/03/2026" (FFF). Fonctions pures.

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

/**
 * Ordre chronologique : la date (jj/mm/aaaa ou ISO) prime, puis le numero de
 * journee, puis l'ordre d'arrivee. Trier les dates comme des chaines placait
 * "15/03/2026" avant "27/09/2025".
 */
export function trierChronologiquement<T extends { date: string | null; journee: string | null }>(matchs: T[]): T[] {
  const numJournee = (j: string | null) => {
    const n = parseInt((j ?? "").replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? Infinity : n;
  };
  return matchs
    .map((m, i) => ({ m, i }))
    .sort((a, b) =>
      (parseDateFlexible(a.m.date) ?? Infinity) - (parseDateFlexible(b.m.date) ?? Infinity)
      || numJournee(a.m.journee) - numJournee(b.m.journee)
      || a.i - b.i)
    .map((x) => x.m);
}
