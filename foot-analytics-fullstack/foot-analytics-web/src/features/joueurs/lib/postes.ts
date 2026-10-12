// src/features/joueurs/lib/postes.ts
//
// "Postes joues" arrive du backend sous la forme "9 (7) / 10 (6) / 13 (2)" :
// numero de maillot et nombre d'apparitions, du plus frequent au moins frequent.
// Dans un tableau on n'en garde que les plus utiles.

/** Les `max` premiers postes ("9 (7)") et le nombre de postes masques. */
export function postesCompacts(postes: string | null | undefined, max = 2): { visibles: string[]; restants: number } {
  const tous = (postes ?? "").split("/").map((p) => p.trim()).filter(Boolean);
  return { visibles: tous.slice(0, max), restants: Math.max(0, tous.length - max) };
}
