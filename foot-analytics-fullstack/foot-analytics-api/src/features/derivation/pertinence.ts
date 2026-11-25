// src/features/derivation/pertinence.ts
//
// Une seance ou une blessure modifiee ne change la FATIGUE d'un joueur que si l'un des champs qui entrent dans son calcul a change : recalculer
// pour un simple changement de theme ou de terrain serait du travail (et du trafic de base de donnees) pour rien. Fonctions pures.

import { Blessure } from "@/features/blessures/blessure.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";

type SeanceFatigue = Pick<Entrainement, "equipeId" | "date" | "charge" | "joueursPresents">;
type BlessureFatigue = Pick<Blessure, "joueurId" | "clubId" | "dateDebut" | "retourEstime" | "statut">;

/** Les champs d'une seance qui entrent dans la fatigue : son equipe (donc son club), sa date, sa charge et ses presents. */
export function cleSeance(s: SeanceFatigue): string {
  return JSON.stringify([s.equipeId ?? null, s.date ?? null, s.charge ?? 0, [...(s.joueursPresents ?? [])].sort()]);
}

export const seanceChangeLaFatigue = (avant: SeanceFatigue, apres: SeanceFatigue): boolean => cleSeance(avant) !== cleSeance(apres);

/** Les champs d'une blessure qui entrent dans la fatigue : le joueur, le club, les dates et le statut. */
export function cleBlessure(b: BlessureFatigue): string {
  return JSON.stringify([b.joueurId ?? null, b.clubId ?? null, b.dateDebut ?? null, b.retourEstime ?? null, b.statut ?? null]);
}

export const blessureChangeLaFatigue = (avant: BlessureFatigue, apres: BlessureFatigue): boolean => cleBlessure(avant) !== cleBlessure(apres);
