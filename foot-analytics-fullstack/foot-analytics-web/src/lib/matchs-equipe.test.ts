import { describe, expect, it } from "vitest";
import { bilanDesResultats, parseDateMatch, resultatsDeLEquipe } from "./matchs-equipe";

const m = (id: string, o: Record<string, any> = {}) => ({
  id, journee: "1", date: "01/09/2025", clubDom: "A", clubExt: "B",
  equipeDomId: "eA", equipeExtId: "eB", scoreDom: 2, scoreExt: 1, statut: "joue" as const, ...o,
});

describe("parseDateMatch", () => {
  it("lit JJ/MM/AAAA et ISO, 0 sinon", () => {
    expect(parseDateMatch("18/01/2026")).toBe(new Date(2026, 0, 18).getTime());
    expect(parseDateMatch("2026-01-18")).toBe(new Date(2026, 0, 18).getTime());
    expect(parseDateMatch("demain")).toBe(0);
    expect(parseDateMatch(null)).toBe(0);
  });
});

describe("resultatsDeLEquipe", () => {
  it("ne garde que les matchs de l'equipe, pas ceux des autres equipes du club", () => {
    const matchs = [m("1"), m("2", { equipeDomId: "eA-U20" }), m("3", { equipeDomId: "x", equipeExtId: "eA" })];
    const { joues } = resultatsDeLEquipe(matchs, "eA");
    expect(joues.map((r) => r.matchId).sort()).toEqual(["1", "3"]);
  });

  it("calcule buts, lieu, adversaire et issue du point de vue de l'equipe", () => {
    const { joues } = resultatsDeLEquipe([
      m("dom", { scoreDom: 3, scoreExt: 1 }),
      m("ext", { equipeDomId: "eB", equipeExtId: "eA", clubDom: "B", clubExt: "A", scoreDom: 2, scoreExt: 2 }),
    ], "eA");
    expect(joues.find((r) => r.matchId === "dom")).toMatchObject({ lieu: "Domicile", advClubId: "B", butsMarques: 3, butsEncaisses: 1, issue: "V" });
    expect(joues.find((r) => r.matchId === "ext")).toMatchObject({ lieu: "Exterieur", advClubId: "B", issue: "N" });
  });

  it("trie les resultats du plus ancien au plus recent et les matchs a venir du plus proche", () => {
    const { joues, aVenir } = resultatsDeLEquipe([
      m("recent", { date: "10/03/2026" }), m("ancien", { date: "01/09/2025" }),
      m("loin", { date: "30/05/2026", statut: "a_venir", scoreDom: 0, scoreExt: 0 }),
      m("proche", { date: "05/04/2026", statut: "a_venir", scoreDom: 0, scoreExt: 0 }),
    ], "eA");
    expect(joues.map((r) => r.matchId)).toEqual(["ancien", "recent"]);
    expect(aVenir.map((x) => x.id)).toEqual(["proche", "loin"]);
  });

  it("un 0-0 non marque joue est a venir, un 0-0 joue est un nul", () => {
    const r = resultatsDeLEquipe([
      m("futur", { scoreDom: 0, scoreExt: 0, statut: "a_venir" }),
      m("nul", { scoreDom: 0, scoreExt: 0, statut: "joue" }),
    ], "eA");
    expect(r.aVenir.map((x) => x.id)).toEqual(["futur"]);
    expect(r.joues[0].issue).toBe("N");
  });
});

describe("bilanDesResultats", () => {
  it("cumule V/N/D, buts et points", () => {
    const b = bilanDesResultats([
      { butsMarques: 2, butsEncaisses: 0 }, { butsMarques: 1, butsEncaisses: 1 }, { butsMarques: 0, butsEncaisses: 3 },
    ]);
    expect(b).toEqual({ joues: 3, v: 1, n: 1, d: 1, bp: 3, bc: 4, pts: 4 });
  });
  it("aucun match : tout a zero", () => {
    expect(bilanDesResultats([])).toEqual({ joues: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, pts: 0 });
  });
});
