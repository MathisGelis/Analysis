import {
  ajusterChoix, ajusterLogistique, assigner, ExempleBinaire, ExempleChoix, probabilitesChoix, resoudre, sigmoide,
} from "@/features/ia/ia-maths";
import { alea } from "./ligue";

describe("resoudre", () => {
  it("resout un systeme lineaire (avec pivot)", () => {
    expect(resoudre([[0, 2], [3, 1]], [4, 5]).map((x) => +x.toFixed(9))).toEqual([1, 2]);
    const x = resoudre([[4, 1, 0], [1, 3, 1], [0, 1, 2]], [1, 2, 3]);
    expect(4 * x[0] + x[1]).toBeCloseTo(1, 9);
    expect(x[0] + 3 * x[1] + x[2]).toBeCloseTo(2, 9);
  });

  it("matrice singuliere : erreur franche", () => {
    expect(() => resoudre([[1, 2], [2, 4]], [1, 2])).toThrow(/singulier/);
  });
});

describe("sigmoide", () => {
  it("est stable aux grandes valeurs", () => {
    expect(sigmoide(0)).toBe(0.5);
    expect(sigmoide(800)).toBe(1);
    expect(sigmoide(-800)).toBe(0);
    expect(sigmoide(2) + sigmoide(-2)).toBeCloseTo(1, 12);
  });
});

describe("ajusterLogistique", () => {
  /** Des exemples tires d'un vrai modele : intercept -1, pente 2. */
  function exemples(n: number): ExempleBinaire[] {
    const hasard = alea(7);
    return Array.from({ length: n }, () => {
      const x = hasard() * 2 - 1;
      return { x: [1, x], y: hasard() < sigmoide(-1 + 2 * x) ? 1 : 0, s: 1 } as ExempleBinaire;
    });
  }

  it("retrouve les poids qui ont genere les donnees (beaucoup d'exemples, peu de regularisation)", () => {
    const w = ajusterLogistique(exemples(4000), [0, 0], [0, 0], { l2: 0.01, iterations: 20 });
    expect(w[0]).toBeCloseTo(-1, 0);
    expect(w[1]).toBeCloseTo(2, 0);
  });

  it("une forte regularisation garde les poids pres de l'a priori", () => {
    const w = ajusterLogistique(exemples(50), [0, 0], [3, -3], { l2: 1e6, iterations: 20 });
    expect(w[0]).toBeCloseTo(3, 2);
    expect(w[1]).toBeCloseTo(-3, 2);
  });

  it("sans exemple : les poids de depart, intacts", () => {
    expect(ajusterLogistique([], [1, 2, 3], [0, 0, 0], { l2: 1 })).toEqual([1, 2, 3]);
  });

  it("donnees parfaitement separables : ne diverge pas (pas amorti)", () => {
    const ex: ExempleBinaire[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ x: [1, 1 + i / 20], y: 1 as const, s: 1 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: [1, -1 - i / 20], y: 0 as const, s: 1 })),
    ];
    const w = ajusterLogistique(ex, [-3.5, 4], [-3.5, 4], { l2: 0.3, iterations: 8 });
    expect(w.every((v) => Number.isFinite(v) && Math.abs(v) < 50)).toBe(true);
    const perte = (v: number[]) => ex.reduce((s, e) => s + Math.log1p(Math.exp(-(e.y ? 1 : -1) * (v[0] * e.x[0] + v[1] * e.x[1]))), 0);
    expect(perte(w)).toBeLessThan(perte([-3.5, 4]) + 1e-9);
  });

  it("le poids d'un exemple compte : un exemple a poids nul est ignore", () => {
    const base = exemples(300);
    const bruit: ExempleBinaire[] = [{ x: [1, 0.9], y: 0, s: 0 }, { x: [1, -0.9], y: 1, s: 0 }];
    const a = ajusterLogistique(base, [0, 0], [0, 0], { l2: 0.1, iterations: 15 });
    const b = ajusterLogistique([...base, ...bruit], [0, 0], [0, 0], { l2: 0.1, iterations: 15 });
    expect(b[0]).toBeCloseTo(a[0], 8);
    expect(b[1]).toBeCloseTo(a[1], 8);
  });
});

describe("ajusterChoix", () => {
  it("apprend quel candidat gagne : le trait qui annonce le bon choix recoit un poids positif", () => {
    const hasard = alea(11);
    // 3 candidats ; le trait 0 indique le bon (avec du bruit), le trait 1 est du bruit pur.
    const exemples: ExempleChoix[] = Array.from({ length: 600 }, () => {
      const vrai = Math.floor(hasard() * 3);
      const phi = [0, 1, 2].map((k) => [k === vrai ? 1 : 0, hasard()]);
      return { phi, vrai, s: 1 };
    });
    const w = ajusterChoix(exemples, [0, 0], [0, 0], { l2: 0.1, iterations: 20 });
    expect(w[0]).toBeGreaterThan(3);
    expect(Math.abs(w[1])).toBeLessThan(0.7);
  });

  it("probabilitesChoix : softmax, somme 1, stable", () => {
    const p = probabilitesChoix([1, 0], [[1000, 0], [999, 0], [0, 0]]);
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(p[0]).toBeGreaterThan(p[1]);
    expect(p[2]).toBe(0);
  });

  it("sans exemple : les poids de depart", () => {
    expect(ajusterChoix([], [1, 2], [0, 0], { l2: 1 })).toEqual([1, 2]);
  });
});

describe("assigner (hongrois)", () => {
  function parForceBrute(c: number[][]): number {
    const n = c.length, m = c[0].length;
    let meilleur = Infinity;
    const aller = (i: number, pris: Set<number>, total: number) => {
      if (i === n) { meilleur = Math.min(meilleur, total); return; }
      for (let j = 0; j < m; j++) if (!pris.has(j)) { pris.add(j); aller(i + 1, pris, total + c[i][j]); pris.delete(j); }
    };
    aller(0, new Set(), 0);
    return meilleur;
  }

  it("trouve le cout minimal (verifie par force brute sur des matrices aleatoires)", () => {
    const hasard = alea(3);
    for (let essai = 0; essai < 25; essai++) {
      const n = 2 + Math.floor(hasard() * 4);
      const m = n + Math.floor(hasard() * 3);
      const c = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.round(hasard() * 20) - 10));
      const a = assigner(c);
      expect(new Set(a).size).toBe(n);                                    // chaque ligne a une colonne distincte
      expect(a.reduce((s, j, i) => s + c[i][j], 0)).toBe(parForceBrute(c));
    }
  });

  it("cas limites : aucune ligne, plus de lignes que de colonnes", () => {
    expect(assigner([])).toEqual([]);
    expect(() => assigner([[1], [2]])).toThrow(/impossible/);
  });
});
