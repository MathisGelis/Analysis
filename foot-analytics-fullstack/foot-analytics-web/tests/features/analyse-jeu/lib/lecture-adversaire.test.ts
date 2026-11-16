import { describe, expect, it } from "vitest";

import type { JeuEquipe } from "@/features/analyse-jeu/lib/jeu-types";
import { constatsAdversaire, nomZone } from "@/features/analyse-jeu/lib/lecture-adversaire";

const zero = { pour: 0, contre: 0 };
const base = (p: Partial<JeuEquipe> = {}): JeuEquipe => ({
  couverture: { matchs: 3, saisis: 3, butsDates: 3, avecCartons: 3 },
  buts: { pour: [0, 0, 0, 0, 0, 0], contre: [0, 0, 0, 0, 0, 0], matchsCouverts: 3, total: zero },
  tirs: null, discipline: null, matchs: [], ...p,
});
const carte = (i: number, n: number) => Object.assign(Array(15).fill(0), { [i]: n });

describe("lecture de l'adversaire", () => {
  it("noms de zones", () => { expect(nomZone(3)).toBe("Offensif · axe droit"); expect(nomZone(7)).toBe("Médian · centre"); });

  it("rien à dire sans échantillon", () => {
    expect(constatsAdversaire(base(), "Mions")).toEqual([]);
    expect(constatsAdversaire(base({ tirs: { matchs: 1, pour: { tirs: 3, cadres: 1, buts: 0 }, contre: { tirs: 2, cadres: 1, buts: 0 }, parMatch: { pour: 3, contre: 2 }, conversion: { pour: 0, contre: 0 }, cadresPct: { pour: 33, contre: 50 }, carte: { pour: { tirs: carte(3, 3), buts: carte(3, 0) }, contre: { tirs: carte(0, 0), buts: carte(0, 0) } }, contextes: [], familles: [] } }), "Mions")).toEqual([]);
  });

  it("zone dominante, efficacité, minute des buts, coups de pied arrêtés", () => {
    const jeu = base({
      buts: { pour: [0, 0, 0, 1, 3, 0], contre: [0, 0, 0, 0, 0, 0], matchsCouverts: 4, total: { pour: 4, contre: 0 } },
      tirs: {
        matchs: 4, pour: { tirs: 12, cadres: 7, buts: 4 }, contre: { tirs: 6, cadres: 2, buts: 1 }, parMatch: { pour: 3, contre: 1.5 }, conversion: { pour: 33, contre: 17 }, cadresPct: { pour: 58, contre: 33 },
        carte: { pour: { tirs: Object.assign(Array(15).fill(0), { 3: 6, 2: 3, 7: 3 }), buts: Array(15).fill(0) }, contre: { tirs: Array(15).fill(0), buts: Array(15).fill(0) } },
        contextes: [], familles: [{ famille: "Coup de pied arrêté", tirs: 5, buts: 2 }, { famille: "Jeu placé", tirs: 7, buts: 2 }],
      },
    });
    const c = constatsAdversaire(jeu, "Mions");
    expect(c.length).toBeLessThanOrEqual(4);
    expect(c.some((x) => x.includes("Offensif · axe droit") && x.includes("50 %"))).toBe(true);
    expect(c.some((x) => x.includes("33 % de conversion"))).toBe(true);
    expect(c.some((x) => x.includes("75 %") && x.includes("60e et la 75e"))).toBe(true);
    expect(c.some((x) => x.includes("2 de ses 4 buts") && x.includes("coups de pied arrêtés"))).toBe(true);
  });
});
