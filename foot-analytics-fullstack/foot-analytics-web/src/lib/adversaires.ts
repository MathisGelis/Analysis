// src/lib/adversaires.ts
//
// Choix de l'adversaire d'un match : les clubs proposes, regroupes et classes selon la recherche. Fonctions pures.
// Les clubs de MA poule passent d'abord (ce sont les adversaires du championnat), puis tous les autres.

import { normaliser, scoreRecherche } from "@/lib/recherche";

export interface ClubChoix { id: string; nom: string; ville?: string | null }

export interface GroupeAdversaires { cle: "poule" | "autres" | "resultats"; titre: string; clubs: ClubChoix[] }

/**
 * Sans recherche : deux groupes, ma poule puis les autres clubs, chacun de A a Z. Avec recherche : un seul groupe
 * de resultats, du plus pertinent au moins pertinent (les clubs de ma poule departagent les egalites).
 * Mon propre club n'est jamais propose.
 */
export function classerAdversaires(
  clubs: ClubChoix[], options: { monClubId?: string | null; suggeres?: Iterable<string>; requete?: string },
): GroupeAdversaires[] {
  const suggeres = new Set(options.suggeres ?? []);
  const possibles = clubs.filter((c) => c.id !== options.monClubId);
  const parNom = (a: ClubChoix, b: ClubChoix) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" });
  const requete = (options.requete ?? "").trim();

  if (requete) {
    const resultats = possibles
      .map((c) => ({ c, score: scoreRecherche(requete, c.nom, c.ville) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || Number(suggeres.has(b.c.id)) - Number(suggeres.has(a.c.id)) || parNom(a.c, b.c))
      .map((x) => x.c);
    return resultats.length ? [{ cle: "resultats", titre: `${resultats.length} club${resultats.length > 1 ? "s" : ""}`, clubs: resultats }] : [];
  }
  const poule = possibles.filter((c) => suggeres.has(c.id)).sort(parNom);
  const autres = possibles.filter((c) => !suggeres.has(c.id)).sort(parNom);
  return [
    ...(poule.length ? [{ cle: "poule" as const, titre: "Dans ma poule", clubs: poule }] : []),
    ...(autres.length ? [{ cle: "autres" as const, titre: poule.length ? "Autres clubs" : "Clubs", clubs: autres }] : []),
  ];
}

/** Un club du meme nom existe deja (insensible a la casse, aux accents et a la ponctuation) : on n'en cree pas un second. */
export function clubExistant(clubs: ClubChoix[], nom: string): ClubChoix | undefined {
  const n = normaliser(nom);
  return n ? clubs.find((c) => normaliser(c.nom) === n) : undefined;
}
