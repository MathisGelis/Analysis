import { describe, expect, it } from "vitest";

import { normaliser, pastillesJoueur, scoreRecherche } from "@/features/recherche/lib/recherche";

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

describe("pastillesJoueur", () => {
  it("categorie d'une autre equipe, puis saison passee ; rien pour un joueur de mon equipe de la saison en cours", () => {
    expect(pastillesJoueur({ derniereEquipe: { categorie: "U18" }, derniereSaison: { court: "25-26", enCours: true } }, "Seniors")).toEqual(["U18"]);
    expect(pastillesJoueur({ derniereEquipe: { categorie: "U18" }, derniereSaison: { court: "24-25", enCours: false } }, "Seniors")).toEqual(["U18", "24-25"]);
    expect(pastillesJoueur({ derniereEquipe: { categorie: "Seniors" }, derniereSaison: { court: "25-26", enCours: true } }, "seniors")).toEqual([]);
    expect(pastillesJoueur({ derniereSaison: { court: "24-25", enCours: false } }, null)).toEqual(["24-25"]);
    expect(pastillesJoueur({}, "Seniors")).toEqual([]);
  });
});
