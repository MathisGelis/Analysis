import { describe, expect, it } from "vitest";

import { ordonnerOnze } from "@/features/matchs/lib/onze";
import { estNumeroGardien } from "@/features/tactique/lib/composition";
import { ordonnerPourTerrain } from "@/features/analyse/lib/dispositif-equipe";

const joueur = (numero: number) => ({ numero, nom: `J${numero}` });

describe("ordonnerOnze : le gardien au but, quel que soit son maillot", () => {
  it("gardien en 1 : l'ordre par numero est conserve", () => {
    expect(ordonnerOnze([4, 1, 3, 2].map(joueur)).map((j) => j.numero)).toEqual([1, 2, 3, 4]);
  });
  it("gardien en 16 : il passe en premier (avant, le 2 etait au but et le 16 en attaque)", () => {
    const onze = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16].map(joueur);
    const ordonne = ordonnerOnze(onze).map((j) => j.numero);
    expect(ordonne[0]).toBe(16);
    expect(ordonne.slice(1)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it("ne modifie pas la liste d'origine", () => {
    const onze = [2, 16].map(joueur);
    ordonnerOnze(onze);
    expect(onze.map((j) => j.numero)).toEqual([2, 16]);
  });
  it("les maillots de gardien sont le 1 et le 16", () => {
    expect([1, 16].every(estNumeroGardien)).toBe(true);
    expect([0, 2, 11, 12, null, undefined].some((n) => estNumeroGardien(n as number))).toBe(false);
  });
});

describe("ordonnerPourTerrain : le 16 est range avec les gardiens", () => {
  it("un gardien en 16 passe devant la defense", () => {
    const o = ordonnerPourTerrain([2, 3, 9, 16, 4].map((numero) => ({ numero, poste: null })));
    expect(o[0].numero).toBe(16);
  });
});
