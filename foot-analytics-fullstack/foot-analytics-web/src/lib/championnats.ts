// src/lib/championnats.ts
//
// Regroupement des equipes par championnat (competition + poule). Fonction
// pure. Sert a l'ecran Saisons : lister "Seniors D2 Poule C" douze fois, sans
// dire de quel club, ne renseignait sur rien.

import type { Equipe } from "@/lib/types";

export interface EquipeDeGroupe {
  id: string;
  clubId: string;
  clubNom: string;
  /** Nom de l'equipe dans son club ("Seniors D2 Poule C"). */
  nom: string;
}

export interface GroupeChampionnat {
  /** Cle stable : competition|poule. */
  cle: string;
  libelle: string;
  poule: string | null;
  equipes: EquipeDeGroupe[];
}

/**
 * Groupes tries par competition puis poule, equipes triees par nom de club.
 * Une equipe sans competition connue (creee a la main) va dans "Sans
 * competition", en dernier.
 */
export function grouperParChampionnat(
  equipes: Pick<Equipe, "id" | "clubId" | "nom" | "competitionLibelle" | "poule">[],
  nomClub: (clubId: string) => string,
): GroupeChampionnat[] {
  const groupes = new Map<string, GroupeChampionnat>();
  for (const e of equipes) {
    const libelle = e.competitionLibelle?.trim() || "Sans competition";
    const poule = e.poule?.trim() || null;
    const cle = `${libelle}|${poule ?? ""}`;
    let g = groupes.get(cle);
    if (!g) {
      g = { cle, libelle, poule, equipes: [] };
      groupes.set(cle, g);
    }
    g.equipes.push({ id: e.id, clubId: e.clubId, clubNom: nomClub(e.clubId), nom: e.nom });
  }
  const sansCompetition = (g: GroupeChampionnat) => (g.libelle === "Sans competition" ? 1 : 0);
  return [...groupes.values()]
    .map((g) => ({ ...g, equipes: g.equipes.sort((a, b) => a.clubNom.localeCompare(b.clubNom)) }))
    .sort((a, b) =>
      sansCompetition(a) - sansCompetition(b)
      || a.libelle.localeCompare(b.libelle)
      || (a.poule ?? "").localeCompare(b.poule ?? ""));
}
