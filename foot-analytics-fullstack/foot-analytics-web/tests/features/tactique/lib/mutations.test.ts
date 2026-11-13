import { describe, expect, it } from "vitest";

import {
  bilanMutations, categorieMutation, classeBadgeMutation, MAX_HORS_DELAI, MAX_MUTES, motifRefus, STATUTS_MUTATION,
} from "@/features/tactique/lib/mutations";

describe("categorieMutation", () => {
  it.each([
    ["Pas mutation", "aucune"],
    ["Mutation", "mutation"],
    ["Mutation hors delai", "hors_delai"],
    ["Mutation hors délai", "hors_delai"],
    ["Hors délais", "hors_delai"],          // ecriture du jeu de demo
    ["hors période", "hors_delai"],
    ["Non connu", "inconnue"],
    ["", "inconnue"],
    [null, "inconnue"],
    [undefined, "inconnue"],
    ["n'importe quoi", "inconnue"],
  ] as const)("%s -> %s", (statut, categorie) => expect(categorieMutation(statut)).toBe(categorie));

  it("tous les statuts proposes par les formulaires sont compris", () => {
    expect(STATUTS_MUTATION.map(categorieMutation)).toEqual(["aucune", "mutation", "hors_delai", "inconnue"]);
  });
});

describe("bilanMutations", () => {
  it("les limites sont 6 mutés dont 2 hors délai", () => {
    expect(MAX_MUTES).toBe(6);
    expect(MAX_HORS_DELAI).toBe(2);
  });

  it("un hors délai compte aussi parmi les mutés", () => {
    const b = bilanMutations(["Mutation", "Mutation hors delai", "Pas mutation", "Non connu"]);
    expect(b).toMatchObject({ mutes: 2, horsDelai: 1, inconnus: 1, placesMutes: 4, placesHorsDelai: 1, valide: true });
  });

  it("6 mutés dont 2 hors délai : pile à la limite, valide", () => {
    const b = bilanMutations([...Array(4).fill("Mutation"), ...Array(2).fill("Mutation hors delai"), ...Array(5).fill("Pas mutation")]);
    expect(b).toMatchObject({ mutes: 6, horsDelai: 2, placesMutes: 0, placesHorsDelai: 0, valide: true, violations: [] });
  });

  it("7 mutés : invalide, la violation est expliquee", () => {
    const b = bilanMutations(Array(7).fill("Mutation"));
    expect(b.valide).toBe(false);
    expect(b.violations).toEqual(["7 joueurs mutés : le maximum est 6."]);
  });

  it("3 hors délai : invalide même avec peu de mutés", () => {
    const b = bilanMutations(Array(3).fill("Mutation hors delai"));
    expect(b.valide).toBe(false);
    expect(b.violations).toEqual(["3 mutés hors délai : le maximum est 2."]);
  });

  it("les deux limites depassees : deux violations", () => {
    expect(bilanMutations([...Array(8).fill("Mutation"), ...Array(3).fill("Mutation hors delai")]).violations).toHaveLength(2);
  });

  it("liste vide : valide, toutes les places libres", () => {
    expect(bilanMutations([])).toMatchObject({ mutes: 0, placesMutes: 6, placesHorsDelai: 2, valide: true });
  });
});

describe("classeBadgeMutation", () => {
  it("mute en ambre, hors délai en rouge, pas mute en accent, inconnu sans couleur", () => {
    expect(classeBadgeMutation("Mutation")).toBe("badge-amber");
    expect(classeBadgeMutation("Mutation hors delai")).toBe("badge-danger");
    expect(classeBadgeMutation("Pas mutation")).toBe("badge-accent");
    expect(classeBadgeMutation("Non connu")).toBe("");
    expect(classeBadgeMutation(null)).toBe("");
  });
});

describe("motifRefus", () => {
  const dejaSix = Array(6).fill("Mutation");

  it("un joueur non mute ou au statut inconnu n'est jamais refuse, même avec le quota atteint", () => {
    expect(motifRefus(dejaSix, "Pas mutation")).toBeNull();
    expect(motifRefus(dejaSix, "Non connu")).toBeNull();
    expect(motifRefus(dejaSix, null)).toBeNull();
  });

  it("le 7e mute est refuse", () => {
    expect(motifRefus(dejaSix, "Mutation")).toBe("déjà 6 joueurs mutés");
    expect(motifRefus(dejaSix, "Mutation hors delai")).toBe("déjà 6 joueurs mutés");
  });

  it("le 3e hors délai est refuse, un mute dans les delais reste possible", () => {
    const deux = ["Mutation hors delai", "Mutation hors delai", "Mutation"];
    expect(motifRefus(deux, "Mutation hors delai")).toBe("déjà 2 mutés hors délai");
    expect(motifRefus(deux, "Mutation")).toBeNull();
  });

  it("le 2e hors délai et le 6e mute sont acceptes", () => {
    expect(motifRefus(["Mutation hors delai", "Mutation"], "Mutation hors delai")).toBeNull();
    expect(motifRefus(Array(5).fill("Mutation"), "Mutation")).toBeNull();
  });

  it("jamais refuse quand la liste est vide", () => {
    expect(motifRefus([], "Mutation hors delai")).toBeNull();
  });
});
