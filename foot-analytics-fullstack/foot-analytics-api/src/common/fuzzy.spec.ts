import { levenshtein, normaliser, scoreRecherche } from "./fuzzy";

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
    expect(scoreRecherche("diag", libelles("DIAGOLA", "Seydou"))).toBe(1);
    expect(scoreRecherche("SEYDOU", libelles("DIAGOLA", "Seydou"))).toBe(1);
    expect(scoreRecherche("leo", libelles("MARCON", "Léo"))).toBe(1);
  });

  it("nom et prenom dans n'importe quel ordre", () => {
    expect(scoreRecherche("seydou diagola", libelles("DIAGOLA", "Seydou"))).toBe(1);
    expect(scoreRecherche("diagola seydou", libelles("DIAGOLA", "Seydou"))).toBe(1);
  });

  it("tolere une faute de frappe", () => {
    expect(scoreRecherche("diagolla", libelles("DIAGOLA", "Seydou"))).toBeGreaterThan(0.6);
    expect(scoreRecherche("dupond", libelles("DUPONT", "Jean"))).toBeGreaterThan(0.6);
  });

  it("sous-chaine moins bien classee qu'un prefixe", () => {
    const prefixe = scoreRecherche("ola", libelles("OLAGNIER", "Paul"));
    const sousChaine = scoreRecherche("ola", libelles("DIAGOLA", "Seydou"));
    expect(prefixe).toBeGreaterThan(sousChaine);
    expect(sousChaine).toBeGreaterThan(0);
  });

  it("rejette ce qui n'a rien a voir", () => {
    expect(scoreRecherche("zidane", libelles("DIAGOLA", "Seydou"))).toBe(0);
    expect(scoreRecherche("", libelles("DIAGOLA", "Seydou"))).toBe(0);
  });

  it("tous les mots de la requete doivent correspondre", () => {
    expect(scoreRecherche("seydou martin", libelles("DIAGOLA", "Seydou"))).toBe(0);
  });

  it("une requete d'une ou deux lettres ne fait que du prefixe (pas de faute tolerable)", () => {
    expect(scoreRecherche("di", libelles("DIAGOLA", "Seydou"))).toBe(1);
    expect(scoreRecherche("da", libelles("DIAGOLA", "Seydou"))).toBe(0);
  });
});
