// src/features/matchs/numeros-postes.ts
//
// CONVENTION numero de maillot -> poste, celle du staff :
//   1 Gardien (le 16 aussi : gardien remplacant), 2 DD, 3 DG, 4 DCD, 5 DCG, 6 MDC, 7 AG, 8 MC, 9 BU, 10 MO, 11 AD.
// Au-dela de 11 : un remplacant, sans poste (sauf le 16, gardien). Une seule source pour la derivation (poste d'un joueur), la prediction de
// compo (features/analyse/compo-numeros.ts) et le rapport pre-match. Fonctions pures.

export type CodePoste = "GB" | "DD" | "DG" | "DCD" | "DCG" | "MDC" | "AG" | "MC" | "BU" | "MO" | "AD";
export type LignePoste = "GB" | "DEF" | "MIL" | "ATT";

export const POSTE_PAR_NUMERO: Readonly<Record<number, CodePoste>> = {
  1: "GB", 2: "DD", 3: "DG", 4: "DCD", 5: "DCG", 6: "MDC", 7: "AG", 8: "MC", 9: "BU", 10: "MO", 11: "AD",
  16: "GB",
};

export const LIBELLE_POSTE: Readonly<Record<CodePoste, string>> = {
  GB: "Gardien", DD: "Defenseur droit", DG: "Defenseur gauche", DCD: "Defenseur central droit", DCG: "Defenseur central gauche",
  MDC: "Milieu defensif", AG: "Ailier gauche", MC: "Milieu central", BU: "Buteur", MO: "Milieu offensif", AD: "Ailier droit",
};

const LIGNE: Readonly<Record<CodePoste, LignePoste>> = {
  GB: "GB", DD: "DEF", DG: "DEF", DCD: "DEF", DCG: "DEF", MDC: "MIL", MC: "MIL", MO: "MIL", AG: "ATT", AD: "ATT", BU: "ATT",
};

/** Le numero de POSTE d'un maillot : le 16 (gardien remplacant) occupe le poste du 1 ; les autres numeros sont inchanges. */
export const numeroDePoste = (numero: number): number => (numero === 16 ? 1 : numero);

/** Les onze numeros de poste, dans l'ordre. */
export const NUMEROS_DE_POSTE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/** Poste d'un numero de maillot ; null au-dela de 11 (remplacant), sauf le 16 (gardien) ou si le numero n'est pas un entier. */
export function posteDuNumero(numero: number | null | undefined): CodePoste | null {
  return Number.isInteger(numero) ? POSTE_PAR_NUMERO[numero as number] ?? null : null;
}

export function ligneDuNumero(numero: number | null | undefined): LignePoste | null {
  const p = posteDuNumero(numero);
  return p ? LIGNE[p] : null;
}

/**
 * Poste tel qu'il est stocke sur la fiche joueur (vocabulaire de l'effectif : GB, DD, DG, DC, MD, MC, MO, AG, AD, AT).
 * Les deux axiaux (4 et 5) sont "DC" ; le buteur est "AT" (le vocabulaire historique de la base).
 */
export function posteFiche(numero: number | null | undefined): string | null {
  const p = posteDuNumero(numero);
  if (!p) return null;
  if (p === "DCD" || p === "DCG") return "DC";
  if (p === "MDC") return "MD";
  if (p === "BU") return "AT";
  return p;
}
