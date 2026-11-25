import { blessureChangeLaFatigue, seanceChangeLaFatigue } from "@/features/derivation/pertinence";

describe("pertinence d'un recalcul de fatigue", () => {
  const seance = { equipeId: "e1", date: "10/10/2026", charge: 500, joueursPresents: ["a", "b"] };
  it("seance : theme/terrain sans effet ; equipe, date, charge ou presents comptent (ordre des presents indifferent)", () => {
    expect(seanceChangeLaFatigue(seance, { ...seance, joueursPresents: ["b", "a"] })).toBe(false);
    expect(seanceChangeLaFatigue(seance, { ...seance, charge: 600 })).toBe(true);
    expect(seanceChangeLaFatigue(seance, { ...seance, date: "11/10/2026" })).toBe(true);
    expect(seanceChangeLaFatigue(seance, { ...seance, equipeId: "e2" })).toBe(true);
    expect(seanceChangeLaFatigue(seance, { ...seance, joueursPresents: ["a"] })).toBe(true);
  });
  const bl = { joueurId: "j1", clubId: "c1", dateDebut: "01/10/2026", retourEstime: "" as string, statut: "Indisponible" };
  it("blessure : seuls joueur, club, dates et statut comptent", () => {
    expect(blessureChangeLaFatigue(bl, { ...bl })).toBe(false);
    expect(blessureChangeLaFatigue(bl, { ...bl, statut: "Reprise" })).toBe(true);
    expect(blessureChangeLaFatigue(bl, { ...bl, retourEstime: "20/10/2026" })).toBe(true);
  });
});
