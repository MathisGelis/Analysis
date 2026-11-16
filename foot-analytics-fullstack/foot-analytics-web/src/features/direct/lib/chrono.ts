// src/features/direct/lib/chrono.ts
//
// Le chrono, vu de l'ecran : meme calcul que le serveur (foot-analytics-api/src/features/direct/chrono.ts), pour afficher le temps
// qui passe sans interroger l'API chaque seconde. L'heure de reference est celle du SERVEUR (voir `decalage`) : un telephone
// dont l'horloge avance ou retarde affiche malgre tout la bonne minute, la meme que sur les autres appareils.

import type { ChronoDirect } from "./direct-types";

export const baseDeLaPeriode = (c: Pick<ChronoDirect, "periode" | "dureePeriodeMin">): number => (c.periode - 1) * c.dureePeriodeMin;

/** Millisecondes de jeu de la periode courante a l'instant `maintenant` (heure du serveur). */
export function ecouleMs(c: Pick<ChronoDirect, "accumuleMs" | "demarreLe">, maintenant: number): number {
  return c.accumuleMs + (c.demarreLe === null ? 0 : Math.max(0, maintenant - c.demarreLe));
}

/** Minute de match (34:12 de jeu = 34), celle que l'on note sur un evenement. */
export function minuteDe(c: ChronoDirect, maintenant: number): number {
  return baseDeLaPeriode(c) + Math.floor(ecouleMs(c, maintenant) / 60_000);
}

/** « 34:12 » : le temps de MATCH (deuxieme periode comprise), jamais coupe a la mi-temps. */
export function formaterChrono(c: ChronoDirect, maintenant: number): string {
  const total = Math.floor((ecouleMs(c, maintenant) + baseDeLaPeriode(c) * 60_000) / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** « 34 », ou « 45+2 » en temps additionnel. */
export function libelleMinute(minute: number, periode: number, dureePeriodeMin: number): string {
  const fin = periode * dureePeriodeMin;
  return minute >= fin && periode <= 2 ? `${fin}+${minute - fin}` : String(minute);
}

export const LIBELLE_STATUT: Record<ChronoDirect["statut"], string> = {
  avant: "Avant le coup d'envoi", en_cours: "en cours", pause: "en pause", mi_temps: "mi-temps", termine: "terminé",
};

export function libellePeriode(c: Pick<ChronoDirect, "statut" | "periode">): string {
  if (c.statut === "avant") return LIBELLE_STATUT.avant;
  if (c.statut === "mi_temps") return "Mi-temps";
  if (c.statut === "termine") return "Match terminé";
  return `${c.periode === 1 ? "1re" : "2e"} période${c.statut === "pause" ? " · en pause" : ""}`;
}
