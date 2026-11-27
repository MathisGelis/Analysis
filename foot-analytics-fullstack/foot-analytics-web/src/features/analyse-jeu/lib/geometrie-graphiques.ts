// src/features/analyse-jeu/lib/geometrie-graphiques.ts
//
// La geometrie des graphiques du Data Hub (camembert, radar, courbes) : fonctions pures, testees, sans rien de visuel.

/** Les tranches d'un camembert : angles de depart et d'arrivee en radians (depart en haut, sens horaire), et part de chacune. */
export function tranchesCamembert(valeurs: readonly number[]): { debut: number; fin: number; part: number }[] {
  const total = valeurs.reduce((s, v) => s + Math.max(0, v), 0);
  let angle = -Math.PI / 2;
  return valeurs.map((v) => {
    const part = total > 0 ? Math.max(0, v) / total : 0;
    const debut = angle;
    angle += part * 2 * Math.PI;
    return { debut, fin: angle, part };
  });
}

/** Le chemin SVG d'une part d'anneau (de rayon exterieur `r`, epaisseur `e`) centree en (cx, cy). Une part complete est tracee en deux arcs. */
export function cheminAnneau(cx: number, cy: number, r: number, e: number, debut: number, fin: number): string {
  const ri = r - e;
  const complet = fin - debut >= 2 * Math.PI - 1e-6;
  const fin2 = complet ? debut + Math.PI : fin;
  const p = (rayon: number, a: number) => `${(cx + rayon * Math.cos(a)).toFixed(2)} ${(cy + rayon * Math.sin(a)).toFixed(2)}`;
  const grand = fin2 - debut > Math.PI ? 1 : 0;
  const arc = (a0: number, a1: number, g: number) => `M ${p(r, a0)} A ${r} ${r} 0 ${g} 1 ${p(r, a1)} L ${p(ri, a1)} A ${ri} ${ri} 0 ${g} 0 ${p(ri, a0)} Z`;
  return complet ? `${arc(debut, fin2, 0)} ${arc(fin2, debut + 2 * Math.PI, 0)}` : arc(debut, fin2, grand);
}

/** Les sommets d'un radar a `n` axes : le premier en haut, sens horaire, rayon proportionnel a la valeur entre `min` et `max` (hors bornes : ramenee aux bornes). */
export function pointsRadar(valeurs: readonly (number | null)[], rayon: number, min: number, max: number, cx = 0, cy = 0): { x: number; y: number }[] {
  const n = valeurs.length;
  return valeurs.map((v, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const t = v === null ? 0 : (Math.min(max, Math.max(min, v)) - min) / (max - min);
    return { x: cx + rayon * t * Math.cos(a), y: cy + rayon * t * Math.sin(a) };
  });
}

/** Une liste de points -> « x,y x,y ... » pour un polygone ou une polyligne SVG. */
export const versPoints = (pts: readonly { x: number; y: number }[]): string => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** Les ordonnees d'une courbe dans une zone de hauteur `h` (0 en bas) pour des valeurs de 0 a `max`. */
export const echelleCourbe = (valeurs: readonly number[], h: number, max: number): number[] => valeurs.map((v) => h - (Math.min(max, Math.max(0, v)) / (max || 1)) * h);

/** Un maximum « rond » au-dessus des valeurs, pour un axe lisible (1, 2, 5, 10, 20... fois une puissance de 10). */
export function maxRond(valeurs: readonly number[]): number {
  const m = Math.max(0, ...valeurs);
  if (m <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(m));
  for (const f of [1, 1.5, 2, 3, 5, 10]) if (m <= f * p) return f * p;
  return 10 * p;
}
