import { describe, expect, it } from "vitest";
import { classerAdversaires, clubExistant, type ClubChoix } from "./adversaires";

const clubs: ClubChoix[] = [
  { id: "moi", nom: "OL Sud" },
  { id: "a", nom: "AS Mions", ville: "Mions" },
  { id: "b", nom: "Chaponnay Marennes", ville: "Chaponnay" },
  { id: "c", nom: "FC Genas" },
  { id: "d", nom: "Venissieux FC", ville: "Venissieux" },
];
const noms = (g: { clubs: ClubChoix[] }[]) => g.flatMap((x) => x.clubs.map((c) => c.id));

describe("classerAdversaires", () => {
  it("sans recherche : ma poule d'abord, puis les autres, chacun de A a Z ; jamais mon propre club", () => {
    const g = classerAdversaires(clubs, { monClubId: "moi", suggeres: ["d", "a"] });
    expect(g.map((x) => x.titre)).toEqual(["Dans ma poule", "Autres clubs"]);
    expect(noms(g)).toEqual(["a", "d", "b", "c"]);
  });

  it("sans poule connue : un seul groupe", () => {
    const g = classerAdversaires(clubs, { monClubId: "moi" });
    expect(g.map((x) => x.titre)).toEqual(["Clubs"]);
    expect(g[0].clubs).toHaveLength(4);
  });

  it("recherche tolerante (accents, casse, ville) : un seul groupe de resultats", () => {
    expect(noms(classerAdversaires(clubs, { monClubId: "moi", requete: "venissieux" }))).toEqual(["d"]);
    expect(noms(classerAdversaires(clubs, { monClubId: "moi", requete: "VÉNISSIEUX" }))).toEqual(["d"]);
    expect(noms(classerAdversaires(clubs, { monClubId: "moi", requete: "chapon" }))).toEqual(["b"]);
    expect(classerAdversaires(clubs, { monClubId: "moi", requete: "zzz" })).toEqual([]);
  });

  it("a pertinence egale, les clubs de ma poule passent devant", () => {
    const g = classerAdversaires(clubs, { monClubId: "moi", suggeres: ["c"], requete: "fc" });
    expect(noms(g)).toEqual(["c", "d"]);
  });

  it("le titre des resultats compte les clubs trouves", () => {
    const [g] = classerAdversaires(clubs, { monClubId: "moi", requete: "fc" });
    expect(g.titre).toBe("2 clubs");
  });
});

describe("clubExistant", () => {
  it("meme nom a la casse, aux accents et a la ponctuation pres", () => {
    expect(clubExistant(clubs, "  as  MIONS ")?.id).toBe("a");
    expect(clubExistant(clubs, "Vénissieux FC")?.id).toBe("d");
    expect(clubExistant(clubs, "Inconnu")).toBeUndefined();
    expect(clubExistant(clubs, "   ")).toBeUndefined();
  });
});
