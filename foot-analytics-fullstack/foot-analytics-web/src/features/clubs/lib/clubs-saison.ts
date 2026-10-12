// src/features/clubs/lib/clubs-saison.ts
//
// Quels clubs existent sur une saison ? Un club sans equipe sur la saison choisie
// n'a rien a faire dans les listes de scouting ou de rapports (il etait la
// l'an passe, il est peut-etre monte, descendu ou parti). Fonctions pures.

import { memeChampionnat } from "@/features/equipes/lib/empreinte-equipe";
import type { Club, Equipe } from "@/shared/lib/types";

/** Clubs (hors `sauf`) qui ont au moins une equipe sur la saison, tries par nom. */
export function clubsDeLaSaison(
  clubs: Club[], equipes: Pick<Equipe, "clubId" | "saisonId">[], saisonId: string | null, sauf?: string | null,
): Club[] {
  const ids = new Set(equipes.filter((e) => !saisonId || e.saisonId === saisonId).map((e) => e.clubId));
  return clubs.filter((c) => ids.has(c.id) && c.id !== sauf).sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Ids des clubs qui jouent dans le meme championnat que `maEquipe` (mon club exclu). */
export function clubsDuChampionnat(
  equipes: Pick<Equipe, "clubId" | "saisonId" | "competitionLibelle" | "poule">[],
  maEquipe: (Pick<Equipe, "clubId" | "saisonId" | "competitionLibelle" | "poule">) | null | undefined,
): Set<string> {
  if (!maEquipe) return new Set();
  return new Set(
    equipes.filter((e) => memeChampionnat(e, maEquipe) && e.clubId !== maEquipe.clubId).map((e) => e.clubId),
  );
}
