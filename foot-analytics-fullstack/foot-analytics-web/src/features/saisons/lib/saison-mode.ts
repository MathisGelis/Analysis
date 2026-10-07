// src/features/saisons/lib/saison-mode.ts
//
// Position de la saison consultee par rapport a la saison active. Sert a
// decider si une page est editable :
//  - active  : saison en cours, tout est editable.
//  - future  : saison a preparer (planification, effectif) -> editable.
//  - passee  : archive -> consultation seule, on ne reecrit pas l'histoire.
//  - inconnue: pas de saison choisie ou pas de saison active -> on ne bloque rien.

import type { Saison } from "@/shared/lib/types";

export type ModeSaison = "active" | "future" | "passee" | "inconnue";

export function modeSaison(
  choisie: Pick<Saison, "id" | "anneeDebut" | "actif"> | null | undefined,
  active: Pick<Saison, "id" | "anneeDebut"> | null | undefined,
): ModeSaison {
  if (!choisie || !active) return "inconnue";
  if (choisie.id === active.id || choisie.actif) return "active";
  return choisie.anneeDebut > active.anneeDebut ? "future" : "passee";
}

/** Les ecritures ne sont refusees que sur une saison passee. */
export const estLectureSeule = (mode: ModeSaison): boolean => mode === "passee";
