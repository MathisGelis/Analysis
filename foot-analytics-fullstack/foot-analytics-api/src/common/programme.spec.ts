import { choisirProgramme } from "./programme";

const prevu = (id: string, date: string | null, statut = "prevu", numeroFmi: string | null = null) =>
  ({ id, date, statut, numeroFmi });

describe("choisirProgramme", () => {
  it("prend le match programme le plus proche de la date de la feuille", () => {
    const aller = prevu("aller", "20/09/2025");
    const retour = prevu("retour", "25/01/2026");
    expect(choisirProgramme([aller, retour], "18/01/2026")?.id).toBe("retour");
    expect(choisirProgramme([aller, retour], "2025-09-21")?.id).toBe("aller");
  });

  it("ignore un match trop eloigne dans le temps (l'autre rencontre du meme duel)", () => {
    expect(choisirProgramme([prevu("aller", "20/09/2025")], "18/01/2026")).toBeNull();
  });

  it("un match reporte peut se jouer bien plus tard", () => {
    expect(choisirProgramme([prevu("rep", "20/09/2025", "reporte")], "18/01/2026")?.id).toBe("rep");
  });

  it("ne touche jamais un match qui a deja sa feuille, ni un match joue ou annule", () => {
    expect(choisirProgramme([prevu("a", "18/01/2026", "prevu", "123")], "18/01/2026")).toBeNull();
    expect(choisirProgramme([prevu("b", "18/01/2026", "joue")], "18/01/2026")).toBeNull();
    expect(choisirProgramme([prevu("c", "18/01/2026", "annule")], "18/01/2026")).toBeNull();
  });

  it("date de feuille illisible : pas de fusion hasardeuse", () => {
    expect(choisirProgramme([prevu("a", "18/01/2026")], null)).toBeNull();
    expect(choisirProgramme([prevu("a", "18/01/2026")], "bientot")).toBeNull();
  });

  it("match programme sans date : retenu seulement faute de mieux", () => {
    const sansDate = prevu("s", null);
    const date = prevu("d", "17/01/2026");
    expect(choisirProgramme([sansDate, date], "18/01/2026")?.id).toBe("d");
    expect(choisirProgramme([sansDate], "18/01/2026")?.id).toBe("s");
  });
});
