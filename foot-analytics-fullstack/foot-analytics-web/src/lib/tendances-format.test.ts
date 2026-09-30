import { describe, expect, it } from "vitest";
import { decimal, libelleSerie, serieFavorable, tonDuSens } from "./tendances-format";

describe("decimal", () => {
  it("virgule francaise", () => expect(decimal(1.5)).toBe("1,5"));
  it("nombre de chiffres et signe", () => {
    expect(decimal(2, 2)).toBe("2,00");
    expect(decimal(0.4, 1, true)).toBe("+0,4");
    expect(decimal(-0.4, 1, true)).toBe("-0,4");
    expect(decimal(0, 1, true)).toBe("0,0");
  });
});

describe("libelleSerie / serieFavorable", () => {
  it("phrases de series", () => {
    expect(libelleSerie("victoires", 4)).toBe("4 victoires de suite");
    expect(libelleSerie("sans_encaisser", 3)).toBe("3 matchs sans encaisser");
  });
  it("favorable ou non", () => {
    expect(serieFavorable("invaincu")).toBe(true);
    expect(serieFavorable("sans_marquer")).toBe(false);
    expect(serieFavorable("defaites")).toBe(false);
  });
});

describe("tonDuSens", () => {
  it("hausse positive, baisse negative", () => {
    expect(tonDuSens("hausse")).toBe("positif");
    expect(tonDuSens("baisse")).toBe("negatif");
  });
  it("buts encaisses : la hausse est mauvaise", () => {
    expect(tonDuSens("hausse", true)).toBe("negatif");
    expect(tonDuSens("baisse", true)).toBe("positif");
  });
  it("stable ou insuffisant : neutre", () => {
    expect(tonDuSens("stable")).toBe("neutre");
    expect(tonDuSens("insuffisant", true)).toBe("neutre");
  });
});
