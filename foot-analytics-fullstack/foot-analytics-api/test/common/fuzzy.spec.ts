import { levenshtein, levenshteinBorne, motsNormalises, normaliser, scoreMots, scoreRecherche } from "@/common/fuzzy";

describe("normaliser", () => {
  it("retire accents, casse et ponctuation", () => {
    expect(normaliser("  Éloïse-Marie  D'AURIAC ")).toBe("eloise marie d auriac");
    expect(normaliser(null)).toBe("");
  });
});

describe("levenshtein", () => {
  it.each([
    ["dupont", "dupont", 0],
    ["dupont", "dupond", 1],
    ["dupont", "duppont", 1],
    ["kitten", "sitting", 3],
    ["", "abc", 3],
  ])("%s / %s = %i", (a, b, d) => {
    expect(levenshtein(a, b)).toBe(d);
    expect(levenshtein(b, a)).toBe(d);
  });
});

describe("scoreRecherche", () => {
  const libelles = (nom: string, prenom: string) => [`${nom} ${prenom}`, `${prenom} ${nom}`];

  it("prefixe exact = score maximal, insensible aux accents et a la casse", () => {
    expect(scoreRecherche("kabi", libelles("KABIFUP", "Lumipi"))).toBe(1);
    expect(scoreRecherche("LUMIPI", libelles("KABIFUP", "Lumipi"))).toBe(1);
    expect(scoreRecherche("leo", libelles("MARCON", "Léo"))).toBe(1);
  });

  it("nom et prenom dans n'importe quel ordre", () => {
    expect(scoreRecherche("lumipi kabifup", libelles("KABIFUP", "Lumipi"))).toBe(1);
    expect(scoreRecherche("kabifup lumipi", libelles("KABIFUP", "Lumipi"))).toBe(1);
  });

  it("tolere une faute de frappe", () => {
    expect(scoreRecherche("kabifupp", libelles("KABIFUP", "Lumipi"))).toBeGreaterThan(0.6);
    expect(scoreRecherche("dupond", libelles("DUPONT", "Jean"))).toBeGreaterThan(0.6);
  });

  it("sous-chaine moins bien classee qu'un prefixe", () => {
    const prefixe = scoreRecherche("bif", libelles("BIFARDI", "Paul"));
    const sousChaine = scoreRecherche("bif", libelles("KABIFUP", "Lumipi"));
    expect(prefixe).toBeGreaterThan(sousChaine);
    expect(sousChaine).toBeGreaterThan(0);
  });

  it("rejette ce qui n'a rien a voir", () => {
    expect(scoreRecherche("zidane", libelles("KABIFUP", "Lumipi"))).toBe(0);
    expect(scoreRecherche("", libelles("KABIFUP", "Lumipi"))).toBe(0);
  });

  it("tous les mots de la requete doivent correspondre", () => {
    expect(scoreRecherche("lumipi martin", libelles("KABIFUP", "Lumipi"))).toBe(0);
  });

  it("une requete d'une ou deux lettres ne fait que du prefixe (pas de faute tolerable)", () => {
    expect(scoreRecherche("ka", libelles("KABIFUP", "Lumipi"))).toBe(1);
    expect(scoreRecherche("ku", libelles("KABIFUP", "Lumipi"))).toBe(0);
  });
});

describe("levenshteinBorne", () => {
  it("donne la distance exacte jusqu'à la borne, borne + 1 au-delà", () => {
    const mots = ["martin", "martinez", "mertin", "marten", "dupont", "dupond", "x", "", "bertrand", "bertran", "robert", "rober"];
    for (const a of mots) for (const b of mots) {
      const exacte = levenshtein(a, b);
      for (const max of [1, 2, 3]) expect(levenshteinBorne(a, b, max)).toBe(exacte <= max ? exacte : max + 1);
    }
  });
});

describe("scoreMots : le même score que scoreRecherche, sans renormaliser", () => {
  it("sur des noms variés (accents, fautes, ordre, mots multiples)", () => {
    const candidats = ["Martin Léo", "Léo MARTIN", "Dupont-Durand Jean", "Marten Luc", "Bertrand Jean-Pierre", "El Amrani Yanis", "O'Neil Sean", "Müller Théo", "", "X"];
    const requetes = ["mar", "martin", "marti lé", "dupond", "jean pierre", "amrani", "oneil", "muller", "theo mul", "zzz", "e", "bertrand"];
    for (const c of candidats) for (const q of requetes) {
      expect(scoreMots(motsNormalises(q), motsNormalises(c))).toBeCloseTo(scoreRecherche(q, [c, c.split(" ").reverse().join(" ")]), 10);
    }
  });
});
