import { describe, expect, it } from "vitest";

import { cleAutres, clePlanning, lireAutresLocaux, lirePlanningLocal } from "@/features/calendrier/lib/ancien-stockage";

describe("ancien stockage du calendrier (navigateur)", () => {
  it("clés par équipe", () => {
    expect(clePlanning("e1")).toBe("fa.planning.e1");
    expect(cleAutres("e1")).toBe("fa.autres.e1");
  });

  it("planning : jours triés sans doublon, heure valide ; sinon ignoré", () => {
    expect(lirePlanningLocal(JSON.stringify({ jours: [3, 1, 3], heure: "19:30" }))).toEqual({ jours: [1, 3], heure: "19:30" });
    expect(lirePlanningLocal(JSON.stringify({ jours: [1, 9, "x"], heure: "19:30" }))).toEqual({ jours: [1], heure: "19:30" });
    expect(lirePlanningLocal(JSON.stringify({ jours: [1], heure: "7h" }))).toBeNull();
    expect(lirePlanningLocal("pas du json")).toBeNull();
    expect(lirePlanningLocal(null)).toBeNull();
  });

  it("événements « autre » : valides gardés (titre et texte rognés), les autres ignorés", () => {
    const brut = JSON.stringify([
      { id: "autre-1700000000000-ab12cd", date: "2026-12-05", heure: "20:00", titre: "  Réunion  ", description: " Salle 2 " },
      { id: "x", date: "2026-12-05", titre: "id trop court" },
      { id: "autre-1700000000001-ab12cd", date: "5 décembre", titre: "date invalide" },
      { id: "autre-1700000000002-ab12cd", date: "2026-12-06", titre: "   " },
      { id: "autre-1700000000003-ab12cd", date: "2026-12-07", titre: "Sans heure", heure: "tard" },
    ]);
    expect(lireAutresLocaux(brut)).toEqual([
      { id: "autre-1700000000000-ab12cd", date: "2026-12-05", heure: "20:00", titre: "Réunion", description: "Salle 2" },
      { id: "autre-1700000000003-ab12cd", date: "2026-12-07", titre: "Sans heure" },
    ]);
    expect(lireAutresLocaux("{}")).toEqual([]);
    expect(lireAutresLocaux(null)).toEqual([]);
  });
});
