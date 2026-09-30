// src/lib/empreinte-equipe.ts
//
// Regles d'identite entre equipes, partagees par le middleware, les pages
// serveur et le switcher. Fonctions pures, sans dependance Next : utilisables
// cote client, serveur et edge.
//
// Trois notions distinctes :
//  - empreinte      : "meme equipe d'une saison a l'autre" (club + categorie
//                     + competition + poule). Une equipe clonee sur une
//                     nouvelle saison garde la meme empreinte.
//  - championnat    : "meme competition sur la meme saison" (saison +
//                     competition + poule), quel que soit le club.
//  - equivalence    : version plus tolerante de l'empreinte, utilisee pour
//                     retrouver mon equipe sur une autre saison quand la
//                     montee/descente a change la division.

import type { Equipe } from "@/lib/types";

type EquipeMin = Pick<
  Equipe, "id" | "clubId" | "categorie" | "competitionLibelle" | "poule" | "saisonId"
>;

/** Empreinte stable d'une equipe, independante de la saison. */
export function empreinteEquipe(e: Pick<Equipe, "clubId" | "categorie" | "competitionLibelle" | "poule">): string {
  return `${e.clubId}|${e.categorie ?? ""}|${e.competitionLibelle ?? ""}|${e.poule ?? ""}`;
}

/** Deux equipes jouent-elles dans le meme championnat (meme saison, competition, poule) ? */
export function memeChampionnat(
  a: Pick<Equipe, "saisonId" | "competitionLibelle" | "poule">,
  b: Pick<Equipe, "saisonId" | "competitionLibelle" | "poule">,
): boolean {
  return (a.saisonId ?? null) === (b.saisonId ?? null)
    && (a.competitionLibelle ?? null) === (b.competitionLibelle ?? null)
    && (a.poule ?? null) === (b.poule ?? null);
}

/**
 * `candidate` est-elle l'equivalent de `reference` sur une autre saison ?
 * Meme club, et meme categorie OU meme competition + poule (la categorie
 * seule suffit apres une montee/descente, qui change competition et poule).
 */
export function equipeEquivalente(
  candidate: Pick<Equipe, "clubId" | "categorie" | "competitionLibelle" | "poule">,
  reference: Pick<Equipe, "clubId" | "categorie" | "competitionLibelle" | "poule">,
): boolean {
  if (candidate.clubId !== reference.clubId) return false;
  if ((candidate.categorie ?? null) === (reference.categorie ?? null)) return true;
  return (candidate.competitionLibelle ?? null) === (reference.competitionLibelle ?? null)
    && (candidate.poule ?? null) === (reference.poule ?? null);
}

/** Sous-ensemble de l'utilisateur utile au filtrage (JWT decode ou User en cache). */
export interface UtilisateurPerimetre {
  role?: string;
  equipeIds?: string[] | null;
}

/**
 * Filtre les equipes selon les permissions de l'utilisateur.
 *
 * - Admin, ou pas de liste d'equipes : aucun filtre.
 * - Sinon : une equipe est autorisee si son id est dans la liste OU si son
 *   empreinte est celle d'une equipe autorisee. Ainsi "Seniors D2 Poule C"
 *   autorisee sur 25-26 l'est aussi sur 26-27 (equipe clonee, id inconnu
 *   du JWT mais meme empreinte).
 */
export function filtrerEquipesAutorisees<T extends EquipeMin>(
  equipes: T[],
  user: UtilisateurPerimetre | null | undefined,
): T[] {
  if (!user || user.role === "admin") return equipes;
  if (!Array.isArray(user.equipeIds) || user.equipeIds.length === 0) return equipes;

  const ids = new Set<string>(user.equipeIds);
  const empreintes = new Set<string>(
    equipes.filter((e) => ids.has(e.id)).map(empreinteEquipe),
  );
  return equipes.filter((e) => ids.has(e.id) || empreintes.has(empreinteEquipe(e)));
}
