// src/features/entrainements/lib/seances.ts
//
// Logique pure de la liste des seances : ordre, pagination, presence.

export const SEANCES_PAR_PAGE = 9;

const LIBELLES_ESPACES: Record<string, string> = {
  terrain_entier: "Terrain entier",
  demi_terrain: "Demi-terrain",
  quart_terrain: "Quart de terrain",
  espace_reduit: "Espace reduit",
  salle: "Salle",
  autre: "Autre",
};

export function libelleEspace(id?: string | null): string {
  return (id && LIBELLES_ESPACES[id]) || id || "";
}

interface SeanceTriable { date?: string; heure?: string }

/** Plus recente d'abord (date puis heure) ; les seances sans date en dernier. */
export function ordonnerRecentsDabord<T extends SeanceTriable>(
  seances: T[], versIso: (d?: string) => string | null | undefined,
): T[] {
  const cle = (s: T) => `${versIso(s.date) ?? ""} ${s.heure ?? ""}`;
  return [...seances].sort((a, b) => cle(b).localeCompare(cle(a)));
}

/** Presence moyenne en % (arrondie) sur les seances ayant un effectif ; null si aucune. */
export function moyennePresence(
  seances: { presents: number; total: number }[],
): number | null {
  const valides = seances.filter((s) => s.total > 0);
  if (valides.length === 0) return null;
  const somme = valides.reduce((t, s) => t + s.presents / s.total, 0);
  return Math.round((somme / valides.length) * 100);
}
