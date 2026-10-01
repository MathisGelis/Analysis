import { compterMotifs, fusionnerMotifs, nettoyerMotif, resumeMotifs } from "@/features/derivation/motifs";

describe("nettoyerMotif", () => {
  it("normalise les espaces, la majuscule initiale et le ':' des motifs de staff", () => {
    expect(nettoyerMotif("  comportement   antisportif ")).toBe("Comportement antisportif");
    expect(nettoyerMotif("Staff:manifester sa désapprobation")).toBe("Staff : manifester sa désapprobation");
  });
  it("retire l'initiale de couleur restee collee au texte (\"...brutalite r\")", () => {
    expect(nettoyerMotif("Commet un acte de brutalité r")).toBe("Commet un acte de brutalité");
    expect(nettoyerMotif("Commet un acte de brutalité")).toBe("Commet un acte de brutalité");
  });
  it("vide ou absent : chaine vide", () => {
    expect(nettoyerMotif(undefined)).toBe("");
    expect(nettoyerMotif("   ")).toBe("");
  });
});

describe("compterMotifs", () => {
  it("la somme des motifs + les cartons sans motif retombe TOUJOURS sur le nombre de cartons", () => {
    const cartons = ["Comportement antisportif", "Comportement antisportif", "Retarder la reprise du jeu", "", null, undefined, "  "];
    const d = compterMotifs(cartons);
    expect(d.motifs).toEqual([
      { motif: "Comportement antisportif", n: 2 },
      { motif: "Retarder la reprise du jeu", n: 1 },
    ]);
    expect(d.sansMotif).toBe(4);
    expect(d.motifs.reduce((s, m) => s + m.n, 0) + d.sansMotif).toBe(cartons.length);
  });
  it("regroupe les ecritures d'un meme motif (accents, casse, lettre parasite) sous la plus frequente", () => {
    const d = compterMotifs([
      "Désapprobation en paroles ou en actes", "Desapprobation en paroles ou en actes",
      "DÉSAPPROBATION EN PAROLES OU EN ACTES", "Désapprobation en paroles ou en actes",
      "Commet un acte de brutalité", "Commet un acte de brutalité r",
    ]);
    expect(d.motifs).toEqual([
      { motif: "Désapprobation en paroles ou en actes", n: 4 },
      { motif: "Commet un acte de brutalité", n: 2 },
    ]);
  });
  it("aucun carton : rien", () => {
    expect(compterMotifs([])).toEqual({ motifs: [], sansMotif: 0 });
  });
});

describe("fusionnerMotifs", () => {
  it("additionne plusieurs championnats sans perdre un carton", () => {
    const a = compterMotifs(["Comportement antisportif", "", "Retarder la reprise du jeu"]);
    const b = compterMotifs(["comportement antisportif", "Comportement antisportif", ""]);
    const f = fusionnerMotifs([a, b]);
    expect(f.motifs).toEqual([
      { motif: "Comportement antisportif", n: 3 },
      { motif: "Retarder la reprise du jeu", n: 1 },
    ]);
    expect(f.sansMotif).toBe(2);
    expect(f.motifs.reduce((s, m) => s + m.n, 0) + f.sansMotif).toBe(6);
  });
});

describe("resumeMotifs", () => {
  it("les plus frequents, puis le reste et les cartons sans motif comptes ensemble", () => {
    const d = compterMotifs(["A a", "A a", "B b", "C c", "D d", "E e", ""]);
    expect(resumeMotifs(d, 3)).toBe("A a (2) · B b (1) · C c (1) · +3 autres");
  });
  it("uniquement des cartons sans motif", () => {
    expect(resumeMotifs(compterMotifs(["", ""]))).toBe("Motif non renseigne (2)");
  });
  it("aucun carton : null", () => {
    expect(resumeMotifs(compterMotifs([]))).toBeNull();
  });
});
