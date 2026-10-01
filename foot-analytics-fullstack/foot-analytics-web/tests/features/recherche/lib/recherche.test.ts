import { describe, expect, it } from "vitest";

import { normaliser, scoreRecherche } from "@/features/recherche/lib/recherche";

describe("normaliser", () => {
  it("accents, casse et ponctuation", () => {
    expect(normaliser("  Médical & Charge ! ")).toBe("medical charge");
    expect(normaliser(null)).toBe("");
  });
});

describe("scoreRecherche", () => {
  it("0 sans correspondance ou sans requete", () => {
    expect(scoreRecherche("zzz", "Effectif")).toBe(0);
    expect(scoreRecherche("", "Effectif")).toBe(0);
    expect(scoreRecherche("eff")).toBe(0);
  });
  it("insensible aux accents et a l'ordre des mots", () => {
    expect(scoreRecherche("medical", "Médical & charge")).toBeGreaterThan(0);
    expect(scoreRecherche("marcon leo", "Léo MARCON")).toBeGreaterThan(0);
  });
  it("tous les mots doivent correspondre", () => {
    expect(scoreRecherche("leo dupont", "Léo MARCON")).toBe(0);
  });
  it("debut de mot > fragment, et le texte qui commence par la requete passe devant", () => {
    const debut = scoreRecherche("eff", "Effectif");
    const fragment = scoreRecherche("ectif", "Effectif");
    expect(debut).toBeGreaterThan(fragment);
    expect(scoreRecherche("ma", "Marcon Leo")).toBeGreaterThan(scoreRecherche("ma", "Leo Marcon"));
  });
  it("cherche aussi dans les mots-cles", () => {
    expect(scoreRecherche("blessures", "Medical & charge", "blessures fatigue sante")).toBeGreaterThan(0);
  });
});
