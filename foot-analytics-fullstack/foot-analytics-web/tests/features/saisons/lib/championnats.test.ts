import { describe, expect, it } from "vitest";

import { grouperParChampionnat } from "@/features/saisons/lib/championnats";

const eq = (id: string, clubId: string, competitionLibelle: string | null, poule: string | null, nom = "Seniors") =>
  ({ id, clubId, nom, competitionLibelle, poule });
const nomClub = (id: string) => ({ a: "Zebre FC", b: "Alpha FC", c: "Milan FC" } as Record<string, string>)[id] ?? id;

describe("grouperParChampionnat", () => {
  it("regroupe par competition + poule et trie les clubs par nom", () => {
    const g = grouperParChampionnat([
      eq("1", "a", "Seniors D2", "C"), eq("2", "b", "Seniors D2", "C"), eq("3", "c", "Seniors D2", "A"),
    ], nomClub);

    expect(g.map((x) => [x.libelle, x.poule, x.equipes.map((e) => e.clubNom)])).toEqual([
      ["Seniors D2", "A", ["Milan FC"]],
      ["Seniors D2", "C", ["Alpha FC", "Zebre FC"]],
    ]);
  });

  it("competitions triees alphabetiquement, 'Sans competition' toujours en dernier", () => {
    const g = grouperParChampionnat([
      eq("1", "a", null, null), eq("2", "b", "U20 R2", "B"), eq("3", "c", "Coupe", null), eq("4", "a", "  ", null),
    ], nomClub);
    expect(g.map((x) => x.libelle)).toEqual(["Coupe", "U20 R2", "Sans competition"]);
    expect(g[2].equipes).toHaveLength(2);
  });

  it("aucune equipe : aucun groupe", () => {
    expect(grouperParChampionnat([], nomClub)).toEqual([]);
  });
});
