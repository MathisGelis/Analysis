import { anneeDebutPourDate, dateDansSaison, nomSaison } from "./saison-date";

describe("saison-date", () => {
  it("juillet ouvre la saison, juin la ferme", () => {
    expect(anneeDebutPourDate("30/06/2026")).toBe(2025);
    expect(anneeDebutPourDate("01/07/2026")).toBe(2026);
    expect(anneeDebutPourDate("2025-12-31")).toBe(2025);
    expect(anneeDebutPourDate("2026-01-01")).toBe(2025);
  });
  it("date illisible : null", () => {
    expect(anneeDebutPourDate("")).toBeNull();
    expect(anneeDebutPourDate(null)).toBeNull();
    expect(anneeDebutPourDate("bientot")).toBeNull();
  });
  it("nomSaison", () => expect(nomSaison(2025)).toBe("2025-2026"));
  it("dateDansSaison", () => {
    expect(dateDansSaison("15/01/2026", 2025)).toBe(true);
    expect(dateDansSaison("15/01/2026", 2026)).toBe(false);
    expect(dateDansSaison("n/a", 2025)).toBeNull();
  });
});
