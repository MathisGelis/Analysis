// src/features/tactique/lib/mutations.ts
//
// Regle des joueurs MUTES sur une feuille de match : au plus 6 joueurs mutes, dont au plus 2
// mutes HORS DELAI (hors periode normale de mutation). Fonctions pures, sans acces reseau.
// L'API applique la meme regle a l'enregistrement (foot-analytics-api/src/common/mutations.ts) :
// tout changement ici doit etre reporte la-bas.

export const MAX_MUTES = 6;
export const MAX_HORS_DELAI = 2;

export type CategorieMutation = "aucune" | "mutation" | "hors_delai" | "inconnue";

/** Statuts proposes dans les formulaires joueur. */
export const STATUTS_MUTATION = ["Pas mutation", "Mutation", "Mutation hors delai", "Non connu"] as const;

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Categorie d'un statut de mutation. Tolerant aux ecritures venues de la base ("Mutation hors delai",
 * "Hors delais", "hors periode"...). Un statut vide ou "Non connu" est INCONNU : la regle ne peut pas
 * etre verifiee pour ce joueur (il n'est pas compte, mais signale).
 */
export function categorieMutation(statut: string | null | undefined): CategorieMutation {
  const s = sansAccents(statut ?? "");
  if (!s || s.includes("non connu") || s.includes("inconnu")) return "inconnue";
  if (s.includes("hors")) return "hors_delai";                  // "mutation hors delai", "hors delais", "hors periode"
  if (s.startsWith("pas ") || s.startsWith("non ") || s === "aucune" || s.includes("pas de mutation")) return "aucune";
  if (s.includes("mut")) return "mutation";
  return "inconnue";
}

export interface BilanMutations {
  /** Joueurs mutes (dans les delais ou hors delai). */
  mutes: number;
  horsDelai: number;
  inconnus: number;
  placesMutes: number;
  placesHorsDelai: number;
  /** false des que l'une des deux limites est depassee. */
  valide: boolean;
  violations: string[];
}

export function bilanMutations(statuts: (string | null | undefined)[]): BilanMutations {
  let mutes = 0, horsDelai = 0, inconnus = 0;
  for (const st of statuts) {
    const c = categorieMutation(st);
    if (c === "hors_delai") { mutes++; horsDelai++; }
    else if (c === "mutation") mutes++;
    else if (c === "inconnue") inconnus++;
  }
  const violations: string[] = [];
  if (mutes > MAX_MUTES) violations.push(`${mutes} joueurs mutes : le maximum est ${MAX_MUTES}.`);
  if (horsDelai > MAX_HORS_DELAI) violations.push(`${horsDelai} mutes hors delai : le maximum est ${MAX_HORS_DELAI}.`);
  return {
    mutes, horsDelai, inconnus,
    placesMutes: Math.max(0, MAX_MUTES - mutes),
    placesHorsDelai: Math.max(0, MAX_HORS_DELAI - horsDelai),
    valide: violations.length === 0,
    violations,
  };
}

/**
 * Peut-on ajouter ce joueur a la liste (feuille de match) ? null = oui ; sinon la raison du refus.
 * Un joueur non mute, ou au statut inconnu, n'est jamais refuse par cette regle.
 */
export function motifRefus(statutsActuels: (string | null | undefined)[], candidat: string | null | undefined): string | null {
  const c = categorieMutation(candidat);
  if (c !== "mutation" && c !== "hors_delai") return null;
  const b = bilanMutations(statutsActuels);
  if (c === "hors_delai" && b.horsDelai >= MAX_HORS_DELAI) return `deja ${MAX_HORS_DELAI} mutes hors delai`;
  if (b.mutes >= MAX_MUTES) return `deja ${MAX_MUTES} joueurs mutes`;
  return null;
}

/** Classe de pastille (theme) d'un statut de mutation : mute en ambre, hors delai en rouge. */
export function classeBadgeMutation(statut: string | null | undefined): string {
  const c = categorieMutation(statut);
  return c === "aucune" ? "badge-accent" : c === "mutation" ? "badge-amber" : c === "hors_delai" ? "badge-danger" : "";
}

export const LIBELLE_CATEGORIE: Record<CategorieMutation, string> = {
  aucune: "Pas mute", mutation: "Mute", hors_delai: "Mute hors delai", inconnue: "Statut inconnu",
};
/** Pastille courte affichee sur le terrain et dans les listes ("M", "HD"). */
export const SIGLE_CATEGORIE: Record<CategorieMutation, string | null> = {
  aucune: null, mutation: "M", hors_delai: "HD", inconnue: null,
};
