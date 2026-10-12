import { describe, expect, it } from "vitest";

import { diffButs, fenetreClassement, ligneDeLEquipe, ligneDuClub, lignesDuChampionnat, matchsDuChampionnat } from "@/features/classement/lib/classement";
import type { Equipe, LigneClassement } from "@/shared/lib/types";

const l = (equipeId: string, rang: number, o: Partial<LigneClassement> = {}): LigneClassement => ({
  clubId: `club-${equipeId}`, equipeId, rang, joues: 10, v: 5, n: 2, d: 3, bp: 20, bc: 12, pts: 17, forme: [], ...o,
});
const eq = (id: string, clubId: string, o: Partial<Equipe> = {}): Equipe => ({
  id, clubId, nom: id, categorie: "Seniors", competitionLibelle: "Seniors D2", poule: "C", saisonId: "s1", ...o,
});

describe("lignesDuChampionnat", () => {
  it("garde les equipes du championnat, triees par rang, sans les lignes de club brut", () => {
    const lignes = lignesDuChampionnat(
      [l("e3", 3), l("e1", 1), l("autre", 1), { ...l("x", 2), equipeId: null }],
      new Set(["e1", "e3"]),
    );
    expect(lignes.map((x) => x.equipeId)).toEqual(["e1", "e3"]);
  });
});

describe("ligneDeLEquipe / diffButs", () => {
  it("retrouve la ligne d'une equipe, null sinon", () => {
    const lignes = [l("e1", 1), l("e2", 2)];
    expect(ligneDeLEquipe(lignes, "e2")?.rang).toBe(2);
    expect(ligneDeLEquipe(lignes, "zz")).toBeNull();
    expect(ligneDeLEquipe(lignes, null)).toBeNull();
  });
  it("diffButs = bp - bc", () => expect(diffButs({ bp: 56, bc: 34 })).toBe(22));
});

describe("fenetreClassement", () => {
  const lignes = Array.from({ length: 12 }, (_, i) => l(`e${i + 1}`, i + 1));
  const rangs = (r: LigneClassement[]) => r.map((x) => x.rang);

  it("centre la fenetre sur l'equipe", () => {
    expect(rangs(fenetreClassement(lignes, "e6", 5))).toEqual([4, 5, 6, 7, 8]);
  });
  it("colle au haut et au bas du tableau", () => {
    expect(rangs(fenetreClassement(lignes, "e1", 5))).toEqual([1, 2, 3, 4, 5]);
    expect(rangs(fenetreClassement(lignes, "e12", 5))).toEqual([8, 9, 10, 11, 12]);
  });
  it("sans ligne pour l'equipe : haut du tableau ; tableau court : tout", () => {
    expect(rangs(fenetreClassement(lignes, null, 5))).toEqual([1, 2, 3, 4, 5]);
    expect(fenetreClassement(lignes.slice(0, 3), "e2", 5)).toHaveLength(3);
  });
});

describe("ligneDuClub", () => {
  const equipes = [
    eq("seniors", "club", { poule: "C" }),
    eq("u20", "club", { categorie: "U20", competitionLibelle: "U20 R2", poule: "B" }),
    eq("ancienne", "club", { saisonId: "s0" }),
    eq("autre-club", "autre"),
  ];
  const classement = [l("u20", 1, { pts: 3 }), l("seniors", 4, { pts: 35 }), l("ancienne", 1), l("autre-club", 2)];

  it("prefere l'equipe du meme championnat que la reference", () => {
    const ref = eq("mon-equipe", "moi", { poule: "C" });
    expect(ligneDuClub(classement, equipes, "club", "s1", ref)?.equipeId).toBe("seniors");
  });
  it("sans reference : la meilleure equipe du club sur la saison", () => {
    expect(ligneDuClub(classement, equipes, "club", "s1")?.equipeId).toBe("u20");
  });
  it("ignore les autres saisons et les autres clubs", () => {
    expect(ligneDuClub(classement, equipes, "club", "s2")).toBeNull();
    expect(ligneDuClub(classement, equipes, "inconnu", "s1")).toBeNull();
  });
});

describe("matchsDuChampionnat", () => {
  const champ = new Set(["senA", "senB"]);
  const m = (equipeDomId: string | null, equipeExtId: string | null) => ({ equipeDomId, equipeExtId });
  it("un match entre deux equipes du championnat", () => {
    expect(matchsDuChampionnat([m("senA", "senB")], champ)).toHaveLength(1);
  });
  it("jamais un match des memes clubs dans un autre championnat (U20 entre les clubs de la poule Seniors)", () => {
    expect(matchsDuChampionnat([m("u20A", "u20B"), m("senA", "u20B")], champ)).toEqual([]);
  });
  it("une equipe inconnue ne disqualifie pas le match dont l'autre equipe en est ; deux inconnues : exclu", () => {
    expect(matchsDuChampionnat([m("senA", null), m(null, "senB")], champ)).toHaveLength(2);
    expect(matchsDuChampionnat([m(null, null), m("autre", null)], champ)).toEqual([]);
  });
});
