import { describe, expect, it } from "vitest";

import { dateVersIso } from "@/features/calendrier/lib/calendrier";
import {
  libelleEspace, moyennePresence, ordonnerRecentsDabord, SEANCES_PAR_PAGE,
} from "@/features/entrainements/lib/seances";

describe("seances", () => {
  it("affiche 9 seances par page", () => {
    expect(SEANCES_PAR_PAGE).toBe(9);
  });

  it("ordonne la plus recente d'abord, date puis heure, formats mixtes", () => {
    const l = ordonnerRecentsDabord([
      { id: "a", date: "2025-09-02", heure: "19:30" },
      { id: "b", date: "14/09/2025", heure: "10:00" },
      { id: "c", date: "2025-09-02", heure: "20:30" },
      { id: "d" },
    ], dateVersIso);
    expect(l.map((s) => s.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("moyenne de presence en pourcent, sans effectif ignore", () => {
    expect(moyennePresence([])).toBeNull();
    expect(moyennePresence([{ presents: 0, total: 0 }])).toBeNull();
    expect(moyennePresence([
      { presents: 10, total: 20 }, { presents: 15, total: 20 }, { presents: 0, total: 0 },
    ])).toBe(63);
  });

  it("libelle d'espace", () => {
    expect(libelleEspace("demi_terrain")).toBe("Demi-terrain");
    expect(libelleEspace(null)).toBe("");
  });
});
