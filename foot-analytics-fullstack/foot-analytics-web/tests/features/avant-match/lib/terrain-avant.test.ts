import { describe, expect, it } from "vitest";

import { affecter, basculerBanc, nbTitulaires, onzeComplet, postesDeFormation } from "@/features/avant-match/lib/terrain-avant";

describe("avant-match : terrain", () => {
  it("11 postes dans l'ordre de l'API, le gardien en bas et l'attaque en haut", () => {
    for (const f of ["4-4-2", "4-2-3-1", "4-3-3", "3-5-2", "5-3-2"]) {
      const p = postesDeFormation(f);
      expect(p).toHaveLength(11);
      expect(p.map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(p[0]).toMatchObject({ x: 50, y: 91 });
      expect(Math.max(...p.slice(1).map((x) => x.y))).toBeLessThan(91);
    }
    const p = postesDeFormation("4-3-3");
    expect(p.slice(1, 5).every((x) => x.y === 70)).toBe(true);   // la défense, la plus basse
    expect(p.slice(8).every((x) => x.y === 12)).toBe(true);      // l'attaque, la plus haute
    expect(p.slice(1, 5).map((x) => x.x)).toEqual([20, 40, 60, 80]);
  });

  it("un dispositif invalide retombe sur le 4-4-2", () => {
    expect(postesDeFormation("n'importe quoi")).toHaveLength(11);
  });

  it("onze complet : complète à 11 cases, \"\" pour un poste vide", () => {
    expect(onzeComplet(["a", null, "b"])).toEqual(["a", "", "b", "", "", "", "", "", "", "", ""]);
  });

  it("affecter : le joueur quitte son ancien poste et le banc ; \"\" libère le poste", () => {
    const base = onzeComplet(["a", "b", "c"]);
    const r = affecter(base, ["d", "e"], 5, "d");
    expect(r.titulaires[5]).toBe("d");
    expect(r.remplacants).toEqual(["e"]);
    const deplace = affecter(base, [], 7, "b");
    expect(deplace.titulaires[1]).toBe("");
    expect(deplace.titulaires[7]).toBe("b");
    expect(affecter(base, [], 0, "").titulaires[0]).toBe("");
    expect(nbTitulaires(r.titulaires)).toBe(4);
  });

  it("banc : bascule, ignore un titulaire, plafonné à 7", () => {
    const onze = onzeComplet(["a"]);
    expect(basculerBanc(onze, [], "x")).toEqual(["x"]);
    expect(basculerBanc(onze, ["x"], "x")).toEqual([]);
    expect(basculerBanc(onze, [], "a")).toEqual([]);
    const plein = ["1", "2", "3", "4", "5", "6", "7"];
    expect(basculerBanc(onze, plein, "z")).toEqual(plein);
  });
});
