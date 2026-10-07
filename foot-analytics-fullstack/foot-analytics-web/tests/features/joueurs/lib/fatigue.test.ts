import { describe, expect, it } from "vitest";

import { estEstimation, facteursPrincipaux, lireDetailFatigue, niveauFatigue, plusFatigues } from "@/features/joueurs/lib/fatigue";

describe("niveauFatigue", () => {
  it.each([
    [0, "frais"], [34, "frais"], [35, "normal"], [54, "normal"], [55, "charge"], [74, "charge"], [75, "surcharge"], [100, "surcharge"],
  ] as const)("%i -> %s", (score, niveau) => expect(niveauFatigue(score)).toBe(niveau));

  it("pas de score : pas de niveau (jamais un niveau invente)", () => {
    expect(niveauFatigue(null)).toBeNull();
    expect(niveauFatigue(undefined)).toBeNull();
    expect(niveauFatigue(Number.NaN)).toBeNull();
  });
});

describe("lireDetailFatigue", () => {
  const detail = {
    niveau: "charge", raison: null, fiabilite: "partielle", minutes7j: 90, matchs14j: 2, joursDepuisMatch: 1, joursDepuisEffort: 1,
    facteurs: [
      { cle: "acwr", libelle: "Charge de la semaine", pression: 53, poids: 0.4, points: 21.2, detail: "x" },
      { cle: "residuelle", libelle: "Efforts des derniers jours", pression: 90, poids: 0.3, points: 27, detail: "y" },
      { cle: "congestion", libelle: "Matchs recents", pression: 50, poids: 0.2, points: 10, detail: "z" },
    ],
    calculeLe: "2026-10-14T10:00:00.000Z",
  };
  it("lit le JSON de l'API", () => {
    expect(lireDetailFatigue(JSON.stringify(detail))?.niveau).toBe("charge");
  });
  it("absent, vide ou casse : null, sans exception", () => {
    expect(lireDetailFatigue(null)).toBeNull();
    expect(lireDetailFatigue("")).toBeNull();
    expect(lireDetailFatigue("{pas du json")).toBeNull();
    expect(lireDetailFatigue(JSON.stringify({ niveau: "frais" }))).toBeNull();
  });
  it("facteursPrincipaux : les plus lourds d'abord", () => {
    expect(facteursPrincipaux(detail as any, 2).map((f) => f.cle)).toEqual(["residuelle", "acwr"]);
  });
  it("estEstimation : fiabilite partielle uniquement", () => {
    expect(estEstimation(detail as any)).toBe(true);
    expect(estEstimation({ ...detail, fiabilite: "solide" } as any)).toBe(false);
    expect(estEstimation(null)).toBe(false);
  });
});

describe("plusFatigues", () => {
  it("les plus fatigues d'abord, ceux sans score ecartes, limite respectee", () => {
    const j = [{ n: "a", scoreFatigue: 40 }, { n: "b", scoreFatigue: null }, { n: "c", scoreFatigue: 80 }, { n: "d" }, { n: "e", scoreFatigue: 60 }];
    expect(plusFatigues(j, 2).map((x) => x.n)).toEqual(["c", "e"]);
    expect(plusFatigues([{ scoreFatigue: null }])).toEqual([]);
  });
});
