import { describe, expect, it } from "vitest";
import { empreinteEquipe, equipeEquivalente, filtrerEquipesAutorisees, memeChampionnat } from "./empreinte-equipe";
import type { Equipe } from "./types";

const eq = (id: string, o: Partial<Equipe> = {}): Equipe => ({
  id, clubId: "c1", nom: id, categorie: "Seniors", competitionLibelle: "Seniors D2", poule: "C", saisonId: "s1", ...o,
});

describe("empreinteEquipe", () => {
  it("ne depend pas de la saison ni de l'id", () => {
    expect(empreinteEquipe(eq("a", { saisonId: "s1" }))).toBe(empreinteEquipe(eq("b", { saisonId: "s2" })));
  });
  it("distingue club, categorie, competition et poule ; null = chaine vide", () => {
    expect(empreinteEquipe(eq("a"))).toBe("c1|Seniors|Seniors D2|C");
    expect(empreinteEquipe(eq("a", { categorie: null, poule: undefined }))).toBe("c1||Seniors D2|");
  });
});

describe("memeChampionnat", () => {
  it("meme saison + competition + poule, quel que soit le club", () => {
    expect(memeChampionnat(eq("a"), eq("b", { clubId: "c2" }))).toBe(true);
    expect(memeChampionnat(eq("a"), eq("b", { poule: "A" }))).toBe(false);
    expect(memeChampionnat(eq("a"), eq("b", { saisonId: "s2" }))).toBe(false);
  });
});

describe("equipeEquivalente", () => {
  it("meme club et meme categorie (montee/descente : competition et poule changent)", () => {
    expect(equipeEquivalente(eq("n", { competitionLibelle: "Seniors D1", poule: "A" }), eq("o"))).toBe(true);
  });
  it("meme competition + poule suffit meme si la categorie differe", () => {
    expect(equipeEquivalente(eq("n", { categorie: null }), eq("o"))).toBe(true);
  });
  it("jamais entre clubs differents ni entre categories et championnats differents", () => {
    expect(equipeEquivalente(eq("n", { clubId: "c2" }), eq("o"))).toBe(false);
    expect(equipeEquivalente(eq("n", { categorie: "U20", competitionLibelle: "U20 R2", poule: "B" }), eq("o"))).toBe(false);
  });
});

describe("filtrerEquipesAutorisees", () => {
  const equipes = [eq("a1", { saisonId: "s1" }), eq("a2", { saisonId: "s2" }), eq("u20", { categorie: "U20", competitionLibelle: "U20 R2", poule: "B" })];

  it("admin, absent ou sans liste : aucun filtre", () => {
    expect(filtrerEquipesAutorisees(equipes, { role: "admin", equipeIds: ["a1"] })).toHaveLength(3);
    expect(filtrerEquipesAutorisees(equipes, null)).toHaveLength(3);
    expect(filtrerEquipesAutorisees(equipes, { role: "user", equipeIds: [] })).toHaveLength(3);
  });
  it("autorise aussi les clones d'une equipe autorisee sur les autres saisons (meme empreinte)", () => {
    const r = filtrerEquipesAutorisees(equipes, { role: "user", equipeIds: ["a1"] });
    expect(r.map((e) => e.id)).toEqual(["a1", "a2"]);
  });
});
