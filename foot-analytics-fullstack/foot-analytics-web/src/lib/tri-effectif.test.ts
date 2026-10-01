import { describe, expect, it } from "vitest";
import type { Joueur } from "./types";
import { COLONNES_TRI, sensParDefaut, trierEffectif } from "./tri-effectif";

const j = (nom: string, extra: Partial<Joueur> = {}): Joueur => ({
  id: nom, nom, prenom: "X", clubId: "c", matchs: 0, titularisations: 0, minutes: 0, cartonsJaunes: 0, cartonsRouges: 0, ...extra,
});
const noms = (l: Joueur[]) => l.map((x) => x.nom);

describe("trierEffectif", () => {
  const effectif = [
    j("DURAND", { matchs: 5, minutes: 300, buts: 1, passesDecisives: 4, cartonsJaunes: 2, scoreFatigue: 40, noteMoyenne: 6.5, poste: "MO" }),
    j("ABEL", { matchs: 9, minutes: 800, buts: 6, passesDecisives: 0, cartonsRouges: 1, scoreFatigue: 80, noteMoyenne: 7.2, poste: "AT" }),
    j("MARTIN", { matchs: 9, minutes: 650, buts: 3, passesDecisives: 2, cartonsJaunes: 3, scoreFatigue: null, poste: "GB" }),
  ];

  it("chaque colonne de stats : du plus au moins, ou l'inverse", () => {
    expect(noms(trierEffectif(effectif, "buts", "desc"))).toEqual(["ABEL", "MARTIN", "DURAND"]);
    expect(noms(trierEffectif(effectif, "buts", "asc"))).toEqual(["DURAND", "MARTIN", "ABEL"]);
    expect(noms(trierEffectif(effectif, "passes", "desc"))).toEqual(["DURAND", "MARTIN", "ABEL"]);
    expect(noms(trierEffectif(effectif, "minutes", "desc"))).toEqual(["ABEL", "MARTIN", "DURAND"]);
    expect(noms(trierEffectif(effectif, "jaunes", "desc"))).toEqual(["MARTIN", "DURAND", "ABEL"]);
    expect(noms(trierEffectif(effectif, "rouges", "desc"))[0]).toBe("ABEL");
  });

  it("egalite : ordre alphabetique (ABEL avant MARTIN a 9 matchs)", () => {
    expect(noms(trierEffectif(effectif, "matchs", "desc"))).toEqual(["ABEL", "MARTIN", "DURAND"]);
    expect(noms(trierEffectif(effectif, "matchs", "asc"))).toEqual(["DURAND", "ABEL", "MARTIN"]);
  });

  it("une donnee absente reste en fin de liste dans les deux sens", () => {
    expect(noms(trierEffectif(effectif, "fatigue", "desc"))).toEqual(["ABEL", "DURAND", "MARTIN"]);
    expect(noms(trierEffectif(effectif, "fatigue", "asc"))).toEqual(["DURAND", "ABEL", "MARTIN"]);
    expect(noms(trierEffectif(effectif, "note", "desc")).at(-1)).toBe("MARTIN");
    expect(noms(trierEffectif(effectif, "note", "asc")).at(-1)).toBe("MARTIN");
  });

  it("discipline : un rouge pese trois jaunes", () => {
    const l = [j("A", { cartonsJaunes: 2 }), j("B", { cartonsRouges: 1 }), j("C", { cartonsJaunes: 1 })];
    expect(noms(trierEffectif(l, "discipline", "desc"))).toEqual(["B", "A", "C"]);
  });

  it("poste : du gardien aux attaquants, un poste inconnu apres", () => {
    const l = [j("A", { poste: "AT" }), j("B", { poste: "GB" }), j("C", { poste: "??" }), j("D", { poste: "DC" })];
    expect(noms(trierEffectif(l, "poste", "asc"))).toEqual(["B", "D", "A", "C"]);
  });

  it("nom : insensible aux accents et a la casse ; ne modifie pas la liste d'origine", () => {
    const l = [j("Émile"), j("zola"), j("Abel")];
    const copie = [...l];
    expect(noms(trierEffectif(l, "nom", "asc"))).toEqual(["Abel", "Émile", "zola"]);
    expect(l).toEqual(copie);
  });
});

describe("sensParDefaut", () => {
  it("les stats partent du plus eleve, le nom et le poste de A a Z", () => {
    expect(sensParDefaut("buts")).toBe("desc");
    expect(sensParDefaut("nom")).toBe("asc");
    expect(sensParDefaut("poste")).toBe("asc");
  });

  it("chaque cle du selecteur est unique", () => {
    const cles = COLONNES_TRI.map((c) => c.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});
