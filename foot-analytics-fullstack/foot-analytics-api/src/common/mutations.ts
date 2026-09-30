// src/common/mutations.ts
//
// Regle des joueurs MUTES sur une feuille de match : au plus 6 mutes, dont au plus 2 hors delai.
// Miroir cote serveur de foot-analytics-web/src/lib/mutations.ts (l'interface applique la meme regle
// pour guider la saisie ; ici elle est imposee a l'enregistrement). Fonctions pures.

export const MAX_MUTES = 6;
export const MAX_HORS_DELAI = 2;

export type CategorieMutation = "aucune" | "mutation" | "hors_delai" | "inconnue";

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Categorie d'un statut de mutation ; vide ou "Non connu" = inconnue (non comptee, mais signalee). */
export function categorieMutation(statut: string | null | undefined): CategorieMutation {
  const s = sansAccents(statut ?? "");
  if (!s || s.includes("non connu") || s.includes("inconnu")) return "inconnue";
  if (s.includes("hors")) return "hors_delai";
  if (s.startsWith("pas ") || s.startsWith("non ") || s === "aucune" || s.includes("pas de mutation")) return "aucune";
  if (s.includes("mut")) return "mutation";
  return "inconnue";
}

export interface BilanMutations {
  mutes: number;
  horsDelai: number;
  inconnus: number;
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
  return { mutes, horsDelai, inconnus, valide: violations.length === 0, violations };
}
