import { describe, expect, it } from "vitest";
import { garder } from "@/lib/allegement";

describe("garder", () => {
  const liste = [
    { id: "a", nom: "Alpha", secret: 1, optionnel: undefined },
    { id: "b", nom: "Beta", secret: 2 },
  ];

  it("ne conserve que les champs demandes", () => {
    expect(garder(liste, ["id", "nom"])).toEqual([{ id: "a", nom: "Alpha" }, { id: "b", nom: "Beta" }]);
  });

  it("un champ absent de l'objet reste absent (pas de cle undefined)", () => {
    const [, b] = garder(liste, ["id", "optionnel"]);
    expect("optionnel" in b).toBe(false);
  });

  it("ne modifie pas la liste d'origine", () => {
    garder(liste, ["id"]);
    expect(liste[0]).toHaveProperty("secret", 1);
  });

  it("liste vide : liste vide", () => {
    expect(garder([], ["id"] as never[])).toEqual([]);
  });
});
