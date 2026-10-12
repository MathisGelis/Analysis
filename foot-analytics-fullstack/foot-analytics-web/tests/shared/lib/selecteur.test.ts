import { describe, expect, it } from "vitest";

import {
  dernierActif, filtrerOptions, grouperOptions, indexParFrappe, indexSuivant, normaliser, optionsSimples, premierActif,
  type OptionSelect,
} from "@/shared/lib/selecteur";

const o = (libelle: string, extra: Partial<OptionSelect> = {}): OptionSelect => ({ valeur: libelle.toLowerCase(), libelle, ...extra });

describe("optionsSimples", () => {
  it("la valeur sert aussi de libelle", () => {
    expect(optionsSimples(["GB", "DC"])).toEqual([{ valeur: "GB", libelle: "GB" }, { valeur: "DC", libelle: "DC" }]);
  });
});

describe("filtrerOptions", () => {
  const liste = [o("Gardien"), o("Défenseur central"), o("Milieu offensif"), o("Attaquant", { detail: "pointe" })];

  it("ignore accents et casse", () => {
    expect(filtrerOptions(liste, "DEFENSEUR").map((x) => x.libelle)).toEqual(["Défenseur central"]);
    expect(normaliser("  Équipe ")).toBe("equipe");
  });

  it("chaque mot doit se retrouver, dans n'importe quel ordre, y compris dans le detail", () => {
    expect(filtrerOptions(liste, "offensif milieu").map((x) => x.libelle)).toEqual(["Milieu offensif"]);
    expect(filtrerOptions(liste, "pointe").map((x) => x.libelle)).toEqual(["Attaquant"]);
    expect(filtrerOptions(liste, "milieu gardien")).toEqual([]);
  });

  it("requete vide : tout est rendu", () => {
    expect(filtrerOptions(liste, "   ")).toBe(liste);
  });
});

describe("grouperOptions", () => {
  it("regroupe par titre dans l'ordre d'apparition et garde l'index d'origine", () => {
    const g = grouperOptions([o("Vide"), o("A", { groupe: "Poste" }), o("B", { groupe: "Autres" }), o("C", { groupe: "Poste" })]);
    expect(g.map((x) => x.titre)).toEqual([null, "Poste", "Autres"]);
    expect(g[1].options.map((x) => [x.option.libelle, x.index])).toEqual([["A", 1], ["C", 3]]);
  });

  it("sans groupe : un seul bloc", () => {
    expect(grouperOptions([o("A"), o("B")])).toHaveLength(1);
  });
});

describe("navigation au clavier", () => {
  const liste = [o("A", { desactive: true }), o("B"), o("C", { desactive: true }), o("D"), o("E", { desactive: true })];

  it("saute les options grisees", () => {
    expect(premierActif(liste)).toBe(1);
    expect(dernierActif(liste)).toBe(3);
    expect(indexSuivant(liste, 1, 1)).toBe(3);
    expect(indexSuivant(liste, 3, -1)).toBe(1);
  });

  it("reste sur place en bout de liste", () => {
    expect(indexSuivant(liste, 3, 1)).toBe(3);
    expect(indexSuivant(liste, 1, -1)).toBe(1);
  });

  it("liste entierement grisee : aucun index", () => {
    const grise = [o("A", { desactive: true })];
    expect(premierActif(grise)).toBe(-1);
    expect(dernierActif(grise)).toBe(-1);
  });
});

describe("indexParFrappe", () => {
  const liste = [o("Gardien"), o("Milieu"), o("Meneur"), o("Attaquant"), o("Mixte", { desactive: true })];

  it("une lettre : premiere option qui commence par elle apres la position courante", () => {
    expect(indexParFrappe(liste, "m", 0)).toBe(1);
    expect(indexParFrappe(liste, "m", 1)).toBe(2);
    expect(indexParFrappe(liste, "m", 2)).toBe(1);            // reboucle, "Mixte" est grise
  });

  it("plusieurs lettres : on affine sans quitter l'option qui convient", () => {
    expect(indexParFrappe(liste, "me", 1)).toBe(2);
    expect(indexParFrappe(liste, "mil", 1)).toBe(1);
  });

  it("une meme lettre repetee fait defiler", () => {
    expect(indexParFrappe(liste, "mm", 1)).toBe(2);
  });

  it("aucune correspondance : on reste", () => {
    expect(indexParFrappe(liste, "z", 3)).toBe(3);
    expect(indexParFrappe(liste, "", 3)).toBe(3);
  });

  it("insensible aux accents", () => {
    expect(indexParFrappe([o("Équipe A"), o("Zone")], "e", 1)).toBe(0);
  });
});
