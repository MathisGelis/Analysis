// src/features/classement/lib/zones-predites.ts
//
// Zones du classement predit (montee, relegation) : le nombre de places est choisi par l'utilisateur (rien n'est suppose :
// les reglements different d'un championnat a l'autre). Les probabilites viennent de la repartition des rangs finaux simulee.
// Fonctions pures.

/** Chances (0 a 1) de finir dans les `k` premiers. */
export function chancesHaut(rangs: readonly number[], k: number): number {
  return k <= 0 ? 0 : Math.min(1, rangs.slice(0, k).reduce((s, p) => s + p, 0));
}

/** Chances (0 a 1) de finir dans les `k` derniers. */
export function chancesBas(rangs: readonly number[], k: number): number {
  return k <= 0 ? 0 : Math.min(1, rangs.slice(Math.max(0, rangs.length - k)).reduce((s, p) => s + p, 0));
}

/** Un nombre de places valide (entier, entre 0 et la moitie du championnat) a partir d'une saisie ou d'un stockage ; 0 sinon. */
export function placesValides(brut: unknown, equipes: number): number {
  const n = typeof brut === "number" ? brut : Number(String(brut ?? "").trim());
  return Number.isInteger(n) && n > 0 ? Math.min(n, Math.floor(equipes / 2)) : 0;
}

/** « 62 % », « < 1 % » pour une chance non nulle mais negligeable, « — » pour une zone non definie. */
export function pctChance(p: number | null): string {
  if (p === null) return "—";
  if (p <= 0) return "0 %";
  if (p < 0.005) return "< 1 %";
  if (p > 0.995) return "> 99 %";
  return `${Math.round(p * 100)} %`;
}
