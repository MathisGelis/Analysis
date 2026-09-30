// src/lib/equipe-consultee.ts
//
// Equipe d'un club "consultee" sur la saison choisie : fiche club, rapport
// d'equipe... Un club a plusieurs equipes (Seniors, U20...) et plusieurs saisons ;
// afficher "le club" sans trancher melange tout. Regle : l'equipe du club qui joue
// dans le MEME championnat que mon equipe (comparer deux clubs d'une meme poule),
// sinon la premiere equipe du club sur la saison.

import { memeChampionnat } from "@/lib/empreinte-equipe";
import type { Equipe } from "@/lib/types";

type EquipeMin = Pick<Equipe, "id" | "clubId" | "saisonId" | "competitionLibelle" | "poule">;

export function equipeConsultee<E extends EquipeMin>(args: {
  equipes: E[];
  clubId: string;
  saisonId: string | null;
  maEquipe?: EquipeMin | null;
}): E | null {
  const { equipes, clubId, saisonId, maEquipe } = args;
  const duClub = equipes.filter((e) =>
    e.clubId === clubId && (!saisonId || (e.saisonId ?? null) === saisonId));
  return (maEquipe ? duClub.find((e) => memeChampionnat(e, maEquipe)) : null) ?? duClub[0] ?? null;
}
