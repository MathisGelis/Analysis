import {
  Apparition, changementDeClub, clubParSaison, derniereApparition, derniereSaison, saisonCourte, SaisonRef,
} from "./parcours-joueur";

const s24: SaisonRef = { id: "s24", nom: "2024-2025", anneeDebut: 2024 };
const s25: SaisonRef = { id: "s25", nom: "2025-2026", anneeDebut: 2025 };
const s26: SaisonRef = { id: "s26", nom: "2026-2027", anneeDebut: 2026 };
const saisons = new Map([s24, s25, s26].map((s) => [s.id, s]));
const app = (clubId: string, saisonId: string | null, date: string | null): Apparition => ({ clubId, saisonId, date });

describe("derniereApparition", () => {
  it("prend la plus recente par date, pas par ordre de la liste ni comparaison de chaines", () => {
    // "06/09/2026" < "22/11/2025" comme chaine : c'est pourtant la plus recente.
    const apps = [app("OL", "s26", "06/09/2026"), app("MIONS", "s25", "22/11/2025"), app("MIONS", "s25", "07/09/2025")];
    expect(derniereApparition(apps, saisons)?.clubId).toBe("OL");
  });

  it("a defaut de date, le debut de la saison sert d'instant", () => {
    expect(derniereApparition([app("A", "s24", null), app("B", "s25", null)], saisons)?.clubId).toBe("B");
  });

  it("aucune apparition datable : null (l'appelant garde ce qu'il sait)", () => {
    expect(derniereApparition([app("A", null, null)], saisons)).toBeNull();
    expect(derniereApparition([], saisons)).toBeNull();
  });
});

describe("clubParSaison", () => {
  it("club de la fin de saison, une saison inconnue est ignoree", () => {
    const apps = [app("A", "s25", "01/09/2025"), app("B", "s25", "01/03/2026"), app("C", "inconnue", "01/01/2026"), app("D", null, "01/01/2026")];
    expect([...clubParSaison(apps, saisons)]).toEqual([["s25", "B"]]);
  });
});

describe("derniereSaison", () => {
  it("la plus recente par annee de debut", () => {
    expect(derniereSaison([app("A", "s25", null), app("A", "s24", null)], saisons)).toBe(s25);
    expect(derniereSaison([app("A", null, "01/01/2026")], saisons)).toBeNull();
  });
});

describe("changementDeClub", () => {
  it("meme club deux saisons de suite", () => {
    expect(changementDeClub([app("OL", "s25", "01/10/2025"), app("OL", "s26", "06/09/2026")], saisons)).toBe("meme_club");
  });

  it("club different d'une saison a l'autre (Mions puis Lyon Sud)", () => {
    expect(changementDeClub([app("MIONS", "s25", "07/12/2025"), app("OL", "s26", "06/09/2026")], saisons)).toBe("club_different");
  });

  it("saison precedente non consecutive ou absente : inconnu, jamais deduit d'un trou", () => {
    expect(changementDeClub([app("OL", "s24", "01/10/2024"), app("OL", "s26", "06/09/2026")], saisons)).toBe("inconnu");
    expect(changementDeClub([app("OL", "s26", "06/09/2026")], saisons)).toBe("inconnu");
    expect(changementDeClub([], saisons)).toBe("inconnu");
  });

  it("transfert en cours de saison : c'est le club de fin de saison qui compte", () => {
    const apps = [app("A", "s25", "01/09/2025"), app("OL", "s25", "01/03/2026"), app("OL", "s26", "06/09/2026")];
    expect(changementDeClub(apps, saisons)).toBe("meme_club");
  });
});

describe("saisonCourte", () => {
  it("raccourcit 2024-2025 en 24-25 et laisse le reste", () => {
    expect(saisonCourte("2024-2025")).toBe("24-25");
    expect(saisonCourte("2025 / 2026")).toBe("25-26");
    expect(saisonCourte("Saison test")).toBe("Saison test");
  });
});
