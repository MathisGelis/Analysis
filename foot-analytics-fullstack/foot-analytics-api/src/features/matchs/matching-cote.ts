// src/features/matchs/matching-cote.ts
//
// Rattachement equipe <-> cote (dom/ext) d'un match. Utilise par
// JoueursService.effectif / historique / championnat, qui repetaient chacun
// leur variante de "est-ce que cette equipe joue a domicile ?".
//
// Regle : on se fie d'abord a l'id d'equipe du match (equipeDomId /
// equipeExtId), ce qui distingue correctement deux equipes d'un MEME club
// (Seniors 1 - Seniors 2 en coupe). Pour un ancien match sans rattachement
// d'equipe, on se rabat sur le club.

import type { Equipe } from "@/features/equipes/equipe.entity";

import type { Match } from "./match.entity";

export type Cote = "dom" | "ext";

type MatchCotes = Pick<Match, "clubDom" | "clubExt" | "equipeDomId" | "equipeExtId">;

/** L'equipe donnee est-elle celle qui joue du cote `cote` de ce match ? */
export function isEquipeSurCote(
  match: MatchCotes,
  equipe: Pick<Equipe, "id" | "clubId">,
  cote: Cote,
): boolean {
  const equipeDuCote = cote === "dom" ? match.equipeDomId : match.equipeExtId;
  if (equipeDuCote) return equipeDuCote === equipe.id;
  const clubDuCote = cote === "dom" ? match.clubDom : match.clubExt;
  return clubDuCote === equipe.clubId;
}

/** Club et equipe (peut etre null sur un ancien match) qui jouent du cote `cote`. */
export function equipeDuCote(
  match: MatchCotes,
  cote: Cote,
): { clubId: string; equipeId: string | null } {
  return cote === "dom"
    ? { clubId: match.clubDom, equipeId: match.equipeDomId ?? null }
    : { clubId: match.clubExt, equipeId: match.equipeExtId ?? null };
}
