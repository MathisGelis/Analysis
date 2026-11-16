import { describe, expect, it } from "vitest";

import { libelleFaits, noteTexte, noterPlus, tonNote } from "@/features/apres-match/lib/affichage";

const faits = (p: object = {}) => ({ buts: 0, passes: 0, arrets: 0, tirs: 0, jaunes: 0, rouges: 0, ...p });

describe("apres-match : affichage", () => {
  it("les faits d'un joueur, au singulier et au pluriel", () => {
    expect(libelleFaits(faits())).toBe("rien à signaler");
    expect(libelleFaits(faits({ buts: 1, tirs: 4 }))).toBe("1 but · 4 tirs");
    expect(libelleFaits(faits({ buts: 2, passes: 1 }))).toBe("2 buts · 1 passe décisive");
    expect(libelleFaits(faits({ arrets: 3, jaunes: 1, rouges: 1 }))).toBe("3 arrêts · 1 carton jaune · 1 carton rouge");
  });
  it("la note s'écrit avec une virgule, un tiret quand elle manque", () => {
    expect(noteTexte(7.5)).toBe("7,5");
    expect(noteTexte(10)).toBe("10,0");
    expect(noteTexte(null)).toBe("–");
  });
  it("par demi-point, bornée à 0 et 10, en partant de 6 sans note", () => {
    expect(noterPlus(null, 0.5)).toBe(6.5);
    expect(noterPlus(null, -0.5)).toBe(5.5);
    expect(noterPlus(10, 0.5)).toBe(10);
    expect(noterPlus(0, -0.5)).toBe(0);
    expect(noterPlus(7, -0.5)).toBe(6.5);
  });
  it("le ton de la note", () => {
    expect([null, 8, 7.5, 7, 6.5, 6, 3].map(tonNote)).toEqual(["vide", "haut", "haut", "moyen", "moyen", "bas", "bas"]);
  });
});
