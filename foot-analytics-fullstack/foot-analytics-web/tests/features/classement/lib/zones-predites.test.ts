import { describe, expect, it } from "vitest";

import { chancesBas, chancesHaut, pctChance, placesValides } from "@/features/classement/lib/zones-predites";

const rangs = [0.5, 0.3, 0.1, 0.07, 0.03];       // une equipe sur un championnat de 5

describe("zones du classement predit", () => {
  it("chances de finir dans les k premiers / derniers", () => {
    expect(chancesHaut(rangs, 1)).toBeCloseTo(0.5, 9);
    expect(chancesHaut(rangs, 2)).toBeCloseTo(0.8, 9);
    expect(chancesBas(rangs, 1)).toBeCloseTo(0.03, 9);
    expect(chancesBas(rangs, 2)).toBeCloseTo(0.1, 9);
    expect(chancesHaut(rangs, 0)).toBe(0);
    expect(chancesBas(rangs, 99)).toBe(1);
  });

  it("nombre de places : entier positif, au plus la moitie du championnat, sinon 0", () => {
    expect(placesValides("2", 12)).toBe(2);
    expect(placesValides(3, 12)).toBe(3);
    expect(placesValides(50, 12)).toBe(6);
    for (const mauvais of ["", "x", -1, 1.5, null, undefined, "2.5"]) expect(placesValides(mauvais, 12)).toBe(0);
  });

  it("affichage des chances : negligeable, quasi certain, zone non definie", () => {
    expect(pctChance(0.62)).toBe("62 %");
    expect(pctChance(0)).toBe("0 %");
    expect(pctChance(0.001)).toBe("< 1 %");
    expect(pctChance(0.999)).toBe("> 99 %");
    expect(pctChance(null)).toBe("—");
  });
});
