import { describe, expect, it } from "vitest";

import { cheminAnneau, echelleCourbe, maxRond, pointsRadar, tranchesCamembert, versPoints } from "@/features/analyse-jeu/lib/geometrie-graphiques";

describe("camembert", () => {
  it("les tranches partent du haut, sens horaire, et font le tour complet", () => {
    const t = tranchesCamembert([1, 1, 2]);
    expect(t.map((x) => +x.part.toFixed(2))).toEqual([0.25, 0.25, 0.5]);
    expect(t[0].debut).toBeCloseTo(-Math.PI / 2, 9);
    expect(t[2].fin).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI, 9);
    expect(t[1].debut).toBeCloseTo(t[0].fin, 9);
  });

  it("des valeurs nulles ou negatives ne comptent pas ; tout a zero : rien a dessiner", () => {
    expect(tranchesCamembert([0, 3, -2]).map((x) => x.part)).toEqual([0, 1, 0]);
    expect(tranchesCamembert([0, 0]).every((x) => x.part === 0)).toBe(true);
  });

  it("le chemin d'un anneau : un arc ferme ; une part complete reste tracable (deux arcs)", () => {
    expect(cheminAnneau(0, 0, 76, 26, -Math.PI / 2, 0)).toMatch(/^M .* Z$/);
    const complet = cheminAnneau(0, 0, 76, 26, -Math.PI / 2, (3 * Math.PI) / 2);
    expect((complet.match(/M /g) ?? []).length).toBe(2);
  });
});

describe("radar", () => {
  it("le premier axe est en haut, la valeur de la base est a mi-rayon, une valeur absente reste au centre", () => {
    const [haut, droite, , gauche] = pointsRadar([100, 100, 100, 100], 80, 40, 160);
    expect(haut.x).toBeCloseTo(0, 6);
    expect(haut.y).toBeCloseTo(-(80 * 60) / 120, 6);
    expect(droite.x).toBeGreaterThan(0);
    expect(gauche.x).toBeLessThan(0);
    expect(pointsRadar([null, 160], 80, 40, 160)[0]).toEqual({ x: 0, y: 0 });
    expect(pointsRadar([200, 0], 80, 40, 160)[0].y).toBeCloseTo(-80, 6);      // borne au maximum
    expect(pointsRadar([200, 0], 80, 40, 160)[1].x).toBeCloseTo(0, 6);         // borne au minimum : au centre
  });

  it("les points d'un polygone", () => {
    expect(versPoints([{ x: 1, y: 2 }, { x: 3.14159, y: -4 }])).toBe("1.0,2.0 3.1,-4.0");
  });
});

describe("courbes", () => {
  it("echelle : 0 en bas, le maximum en haut, valeurs bornees", () => {
    expect(echelleCourbe([0, 5, 10, 20], 100, 10)).toEqual([100, 50, 0, 0]);
    expect(echelleCourbe([3], 100, 0)).toEqual([100]);
  });

  it("maximum rond : un axe lisible au-dessus des valeurs", () => {
    expect(maxRond([0.42, 0.8])).toBe(1);
    expect(maxRond([1.2, 0.3])).toBe(1.5);
    expect(maxRond([4.1])).toBe(5);
    expect(maxRond([12])).toBe(15);
    expect(maxRond([])).toBe(1);
  });
});
