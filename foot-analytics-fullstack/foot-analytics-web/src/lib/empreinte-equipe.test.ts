import { describe, expect, it } from "vitest";
import { empreinteEquipe, equipeEquivalente, memeChampionnat, niveauEquipe } from "./empreinte-equipe";
import type { Equipe } from "./types";

const eq = (id: string, o: Partial<Equipe> = {}): Equipe => ({
  id, clubId: "c1", nom: id, categorie: "Seniors", division: "D2", competitionLibelle: "Seniors D2", poule: "C", saisonId: "s1", ...o,
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

describe("niveauEquipe", () => {
  it("club + categorie + division, sans la poule", () => {
    expect(niveauEquipe(eq("a"))).toBe("c1|Seniors|D2");
    expect(niveauEquipe(eq("a", { poule: "A" }))).toBe(niveauEquipe(eq("b")));
  });
  it("null si categorie ou division manque", () => {
    expect(niveauEquipe(eq("a", { division: null }))).toBeNull();
    expect(niveauEquipe(eq("a", { categorie: undefined }))).toBeNull();
  });
});
