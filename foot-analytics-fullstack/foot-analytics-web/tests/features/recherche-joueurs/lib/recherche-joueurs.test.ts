import { describe, expect, it } from "vitest";

import {
  categoriesDe, changerSaison, depuisUrl, divisionsDe, formulaireInitial, libelleEquipe, resumeCriteres, versCriteres, versUrl,
  type FormulaireRecherche, type OptionsRecherche,
} from "@/features/recherche-joueurs/lib/recherche-joueurs";

const OPTIONS: OptionsRecherche = {
  saisons: [
    { id: "s26", nom: "2026-2027", anneeDebut: 2026, actuelle: true },
    { id: "s25", nom: "2025-2026", anneeDebut: 2025, actuelle: false },
  ],
  niveaux: [
    { saisonId: "s25", categorie: "U16", division: "R2" },
    { saisonId: "s25", categorie: "U16", division: "R1" },
    { saisonId: "s25", categorie: "Seniors", division: "D2" },
    { saisonId: "s25", categorie: "u16", division: "R2" },
    { saisonId: "s26", categorie: "U17", division: "R2" },
    { saisonId: "s26", categorie: "Seniors", division: null },
  ],
  defauts: { saisonId: "s25", situationSaisonId: "s26" },
};

const attaquantLibre: FormulaireRecherche = {
  ...formulaireInitial(OPTIONS), poste: "ATT", categorie: "U16", division: "R2", situation: "sans_club",
};

describe("recherche de joueurs : formulaire", () => {
  it("part de la saison precedente (a joue) et de l'actuelle (situation)", () => {
    expect(formulaireInitial(OPTIONS)).toMatchObject({ saisonId: "s25", situationSaisonId: "s26", situation: "indifferent", minMatchs: "1" });
    expect(formulaireInitial(null).saisonId).toBe("");
  });

  it("categories et divisions de la saison choisie, sans doublon de casse", () => {
    expect(categoriesDe(OPTIONS, "s25")).toEqual(["Seniors", "U16"]);
    expect(divisionsDe(OPTIONS, "s25", "U16")).toEqual(["R1", "R2"]);
    expect(divisionsDe(OPTIONS, "s25", "")).toEqual(["D2", "R1", "R2"]);
    expect(divisionsDe(OPTIONS, "s26", "Seniors")).toEqual([]);
  });

  it("changer de saison garde la categorie et la division si elles existent, sinon les efface", () => {
    // Pas de U16 en 2026-2027 : la categorie saute, la division R2 (U17 R2) reste.
    expect(changerSaison(attaquantLibre, "s26", OPTIONS)).toMatchObject({ saisonId: "s26", categorie: "", division: "R2" });
    expect(changerSaison({ ...attaquantLibre, division: "R1" }, "s26", OPTIONS)).toMatchObject({ categorie: "", division: "" });
    const seniors = { ...attaquantLibre, categorie: "Seniors", division: "D2" };
    expect(changerSaison(seniors, "s26", OPTIONS)).toMatchObject({ categorie: "Seniors", division: "" });
  });

  it("criteres envoyes a l'API : la ligne de poste devient ses postes, rien de vide", () => {
    expect(versCriteres(attaquantLibre)).toEqual({
      saisonId: "s25", categorie: "U16", division: "R2", postes: ["AG", "AD", "AT"], situationSaisonId: "s26", situation: "sans_club",
    });
    expect(versCriteres({ ...formulaireInitial(OPTIONS), situationSaisonId: "", minMatchs: "5" })).toEqual({ saisonId: "s25", minMatchs: 5 });
    expect(versCriteres(formulaireInitial(null))).toBeNull();
  });

  it("resume lisible", () => {
    expect(resumeCriteres(attaquantLibre, OPTIONS)).toBe("Attaquants · U16 R2 · 2025-2026 · Sans club connu en 2026-2027");
    expect(resumeCriteres({ ...formulaireInitial(OPTIONS), clubId: "ol", minMatchs: "5" }, OPTIONS, () => "OL Sud"))
      .toBe("Tous les postes · OL Sud · 2025-2026 · 5 matchs ou plus");
  });

  it("aller-retour par l'URL (codes et identifiants seulement), valeurs inconnues ignorees", () => {
    const qs = versUrl(attaquantLibre);
    expect(qs).toBe("poste=ATT&saison=s25&cat=U16&div=R2&cible=s26&situation=sans_club");
    expect(depuisUrl(new URLSearchParams(qs), OPTIONS)).toEqual(attaquantLibre);
    expect(depuisUrl(new URLSearchParams("poste=XX&saison=s25&situation=partout&min=7&cible=inconnue"), OPTIONS))
      .toMatchObject({ poste: "", situation: "indifferent", minMatchs: "1", situationSaisonId: "" });
    expect(depuisUrl(new URLSearchParams("poste=ATT"), OPTIONS)).toBeNull();
    expect(depuisUrl(new URLSearchParams("saison=fermee"), OPTIONS)).toBeNull();
  });

  it("libelle d'equipe : categorie et division, a defaut le nom", () => {
    expect(libelleEquipe({ nom: "U16 R2 Poule A", categorie: "U16", division: "R2" })).toBe("U16 R2");
    expect(libelleEquipe({ nom: "Equipe B", categorie: null, division: null })).toBe("Equipe B");
  });
});
