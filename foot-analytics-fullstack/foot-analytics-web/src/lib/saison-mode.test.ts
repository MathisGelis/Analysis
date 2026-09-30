import { describe, expect, it } from "vitest";
import { estLectureSeule, modeSaison } from "./saison-mode";

const s = (id: string, anneeDebut: number, actif = false) => ({ id, anneeDebut, actif });

describe("modeSaison", () => {
  const active = s("s25", 2025, true);
  it("active, future, passee", () => {
    expect(modeSaison(active, active)).toBe("active");
    expect(modeSaison(s("s26", 2026), active)).toBe("future");
    expect(modeSaison(s("s24", 2024), active)).toBe("passee");
  });
  it("inconnue si saison choisie ou active manquante", () => {
    expect(modeSaison(null, active)).toBe("inconnue");
    expect(modeSaison(s("s24", 2024), null)).toBe("inconnue");
  });
  it("seule une saison passee est en lecture seule", () => {
    expect(estLectureSeule("passee")).toBe(true);
    for (const m of ["active", "future", "inconnue"] as const) expect(estLectureSeule(m)).toBe(false);
  });
});
