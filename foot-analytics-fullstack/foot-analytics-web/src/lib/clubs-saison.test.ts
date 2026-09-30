import { describe, expect, it } from "vitest";
import { clubsDeLaSaison, clubsDuChampionnat } from "./clubs-saison";

const club = (id: string, nom: string) => ({ id, nom, abbr: nom.slice(0, 3), couleur: "#000" });
const clubs = [club("z", "Zebre"), club("a", "Alpha"), club("m", "Moi"), club("p", "Parti")];
const eq = (clubId: string, saisonId: string, poule: string) =>
  ({ clubId, saisonId, poule, competitionLibelle: "Seniors D2" });
const equipes = [
  eq("m", "s26", "A"), eq("a", "s26", "A"), eq("z", "s26", "B"),
  eq("m", "s25", "C"), eq("p", "s25", "C"), eq("a", "s25", "C"),
];

describe("clubsDeLaSaison", () => {
  it("uniquement les clubs de la saison, tries, sans moi", () => {
    expect(clubsDeLaSaison(clubs, equipes, "s26", "m").map((c) => c.nom)).toEqual(["Alpha", "Zebre"]);
  });
  it("un club parti n'apparait pas sur la nouvelle saison", () => {
    expect(clubsDeLaSaison(clubs, equipes, "s26").map((c) => c.id)).not.toContain("p");
    expect(clubsDeLaSaison(clubs, equipes, "s25").map((c) => c.id)).toContain("p");
  });
  it("sans saison : tous les clubs qui ont une equipe", () => {
    expect(clubsDeLaSaison(clubs, equipes, null)).toHaveLength(4);
  });
});

describe("clubsDuChampionnat", () => {
  it("les clubs de ma poule, moi exclu", () => {
    expect([...clubsDuChampionnat(equipes, equipes[0])]).toEqual(["a"]);
    expect([...clubsDuChampionnat(equipes, equipes[3])].sort()).toEqual(["a", "p"]);
  });
  it("sans equipe : vide", () => expect(clubsDuChampionnat(equipes, null).size).toBe(0));
});
