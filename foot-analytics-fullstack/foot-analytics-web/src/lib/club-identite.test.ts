import { describe, expect, it } from "vitest";
import { hashTexte, identiteClub, initialesClub, NB_MOTIFS, TEINTES } from "./club-identite";

describe("initialesClub", () => {
  // Noms reels (tronques par la FFF) du jeu de donnees.
  it.each([
    ["O. Lyon Sud", "LS"],
    ["F.C. Meys Grezieu", "MG"],
    ["A.S. De Montchat Lyo", "ML"],
    ["A.S. Portugaise Vaul", "PV"],
    ["Ev.S. Genas Azieu", "GA"],
    ["F.C. St Paul En Jare", "PJ"],
    ["Fc Colombier-Satolas", "CS"],
    ["Grand Ouest Associat", "GO"],
    ["O.S. Pouilly Pommier", "PP"],
    ["Chaponnay Mar", "CM"],
    ["Crest Aouste", "CA"],
  ])("%s -> %s (deux mots significatifs)", (nom, attendu) => expect(initialesClub(nom)).toBe(attendu));

  it.each([
    ["Neuville S/S", "NEU"],
    ["Scol", "SCO"],
    ["Am.Laiq. Mions", "MIO"],
    ["C.S. Ozon", "OZO"],
    ["Grigny F.C.", "GRI"],
    ["Latino Afc", "LAT"],
    ["Venissieux Fc", "VEN"],
    ["Ent.S. Revermontoise", "REV"],
    ["Ent.S. St Priest", "PRI"],
  ])("%s -> %s (un mot significatif)", (nom, attendu) => expect(initialesClub(nom)).toBe(attendu));

  it("accents ignores, nom vide ou fait de mots vides : repli sans planter", () => {
    expect(initialesClub("Étoile Sportive")).toBe("ETO"); // "sportive" est un mot d'appareil
    expect(initialesClub("F.C. A.S.")).toBe("FCA");
    expect(initialesClub("")).toBe("?");
    expect(initialesClub(null)).toBe("?");
  });
});

describe("identiteClub", () => {
  it("deterministe : meme id, meme identite", () => {
    const a = identiteClub({ id: "934df026", nom: "O. Lyon Sud" });
    expect(identiteClub({ id: "934df026", nom: "O. Lyon Sud" })).toEqual(a);
  });
  it("teinte et motif dans les plages valides, et bien repartis sur beaucoup de clubs", () => {
    const vus = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { teinte, motif } = identiteClub({ id: `club-${i}-${hashTexte(String(i))}`, nom: "X" });
      expect(TEINTES).toContain(teinte);
      expect(motif).toBeGreaterThanOrEqual(0);
      expect(motif).toBeLessThan(NB_MOTIFS);
      vus.add(`${teinte}/${motif}`);
    }
    expect(vus.size).toBeGreaterThanOrEqual(12);
  });
  it("la couleur par defaut de la base n'est pas une vraie couleur ; une couleur choisie l'est", () => {
    expect(identiteClub({ id: "a", nom: "A", couleur: "#b6f24a" }).couleurPerso).toBeNull();
    expect(identiteClub({ id: "a", nom: "A", couleur: "#B6F24A" }).couleurPerso).toBeNull();
    expect(identiteClub({ id: "a", nom: "A", couleur: "#5ab8ff" }).couleurPerso).toBe("#5ab8ff");
    expect(identiteClub({ id: "a", nom: "A", couleur: "rouge" }).couleurPerso).toBeNull();
  });
});
