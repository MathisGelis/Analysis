import { describe, expect, it } from "vitest";
import { postesCompacts } from "./postes";

describe("postesCompacts", () => {
  it("garde les deux plus frequents et compte le reste", () => {
    expect(postesCompacts("9 (7) / 10 (6) / 13 (2) / 3 (1)")).toEqual({ visibles: ["9 (7)", "10 (6)"], restants: 2 });
  });
  it("peu de postes : rien de masque", () => {
    expect(postesCompacts("6 (3)")).toEqual({ visibles: ["6 (3)"], restants: 0 });
  });
  it("vide, null ou espaces : aucun poste", () => {
    for (const v of ["", null, undefined, " / "]) expect(postesCompacts(v)).toEqual({ visibles: [], restants: 0 });
  });
  it("nombre maximal reglable", () => {
    expect(postesCompacts("1 (5) / 2 (4) / 3 (3)", 3).restants).toBe(0);
  });
});
