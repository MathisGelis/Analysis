import { bilanMutations, categorieMutation, MAX_HORS_DELAI, MAX_MUTES } from "@/features/tactiques/mutations";

describe("categorieMutation", () => {
  it.each([
    ["Pas mutation", "aucune"], ["Mutation", "mutation"], ["Mutation hors delai", "hors_delai"],
    ["Mutation hors délai", "hors_delai"], ["Hors délais", "hors_delai"], ["Non connu", "inconnue"],
    ["", "inconnue"], [null, "inconnue"], [undefined, "inconnue"],
  ])("%s -> %s", (statut, categorie) => expect(categorieMutation(statut as any)).toBe(categorie));
});

describe("bilanMutations", () => {
  it("limites : 6 mutes dont 2 hors delai", () => {
    expect([MAX_MUTES, MAX_HORS_DELAI]).toEqual([6, 2]);
  });
  it("pile a la limite : valide ; un hors delai compte aussi parmi les mutes", () => {
    const b = bilanMutations([...Array(4).fill("Mutation"), ...Array(2).fill("Mutation hors delai"), "Pas mutation", "Non connu"]);
    expect(b).toEqual({ mutes: 6, horsDelai: 2, inconnus: 1, valide: true, violations: [] });
  });
  it("7 mutes ou 3 hors delai : invalide", () => {
    expect(bilanMutations(Array(7).fill("Mutation")).violations).toEqual(["7 joueurs mutes : le maximum est 6."]);
    expect(bilanMutations(Array(3).fill("Mutation hors delai")).violations).toEqual(["3 mutes hors delai : le maximum est 2."]);
  });
});
