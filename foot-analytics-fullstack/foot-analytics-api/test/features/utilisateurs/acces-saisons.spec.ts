import { accesSaisonsResultant, saisonsInconnues } from "@/features/utilisateurs/acces-saisons";

describe("accesSaisonsResultant", () => {
  it("sans demande : l'existant ; sans existant : toutes les saisons", () => {
    expect(accesSaisonsResultant({})).toEqual({ toutesSaisons: true, saisonIds: [] });
    expect(accesSaisonsResultant({}, { toutesSaisons: false, saisonIds: ["a"] })).toEqual({ toutesSaisons: false, saisonIds: ["a"] });
  });

  it("restreindre : saison actuelle seule, ou avec des saisons passees (dedoublonnees)", () => {
    expect(accesSaisonsResultant({ toutesSaisons: false })).toEqual({ toutesSaisons: false, saisonIds: [] });
    expect(accesSaisonsResultant({ toutesSaisons: false, saisonIds: ["a", "b", "a"] })).toEqual({ toutesSaisons: false, saisonIds: ["a", "b"] });
  });

  it("garder les saisons choisies quand on modifie autre chose, les remplacer quand on les envoie", () => {
    const avant = { toutesSaisons: false, saisonIds: ["a", "b"] };
    expect(accesSaisonsResultant({ saisonIds: ["c"] }, avant)).toEqual({ toutesSaisons: false, saisonIds: ["c"] });
    expect(accesSaisonsResultant({ saisonIds: [] }, avant)).toEqual({ toutesSaisons: false, saisonIds: [] });
  });

  it("toutes les saisons : la liste est oubliee, meme si on en envoie une", () => {
    expect(accesSaisonsResultant({ toutesSaisons: true, saisonIds: ["a"] })).toEqual({ toutesSaisons: true, saisonIds: [] });
    expect(accesSaisonsResultant({ saisonIds: ["a"] }, { toutesSaisons: true, saisonIds: [] })).toEqual({ toutesSaisons: true, saisonIds: [] });
  });
});

describe("saisonsInconnues", () => {
  it("ne garde que les identifiants hors de la liste connue, sans doublon", () => {
    expect(saisonsInconnues(["a", "x", "x", "b"], ["a", "b"])).toEqual(["x"]);
    expect(saisonsInconnues([], ["a"])).toEqual([]);
  });
});
