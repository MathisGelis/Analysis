import { describe, expect, it } from "vitest";
import { dateVersIso, moisInitial } from "./calendrier";

const mois = (y: number, m: number) => new Date(y, m - 1, 1).getTime();
const saison2526 = { anneeDebut: 2025 };

describe("moisInitial", () => {
  it("aujourd'hui dans la saison : le mois courant", () => {
    expect(moisInitial(saison2526, [], new Date(2026, 2, 14)).getTime()).toBe(mois(2026, 3));
    expect(moisInitial(saison2526, [], new Date(2025, 7, 1)).getTime()).toBe(mois(2025, 8));
    expect(moisInitial(saison2526, [], new Date(2026, 6, 31)).getTime()).toBe(mois(2026, 7));
  });
  it("saison terminee : le mois du dernier match de la saison", () => {
    const dates = ["01/09/2025", "31/05/2026", "10/03/2026", "12/10/2024" /* autre saison */];
    expect(moisInitial(saison2526, dates, new Date(2026, 8, 30)).getTime()).toBe(mois(2026, 5));
  });
  it("saison terminee sans match : juin de la fin de saison", () => {
    expect(moisInitial(saison2526, [], new Date(2026, 8, 30)).getTime()).toBe(mois(2026, 6));
    expect(moisInitial(saison2526, [null, undefined, "illisible"], new Date(2027, 0, 5)).getTime()).toBe(mois(2026, 6));
  });
  it("saison a venir : aout de sa premiere annee", () => {
    expect(moisInitial({ anneeDebut: 2027 }, [], new Date(2026, 8, 30)).getTime()).toBe(mois(2027, 8));
  });
  it("sans saison : le mois courant", () => {
    expect(moisInitial(null, [], new Date(2026, 8, 30)).getTime()).toBe(mois(2026, 9));
  });
});

describe("dateVersIso", () => {
  it("convertit les dates FMI et normalise l'ISO", () => {
    expect(dateVersIso("31/05/2026")).toBe("2026-05-31");
    expect(dateVersIso("05/09/2025")).toBe("2025-09-05");
    expect(dateVersIso("2026-05-31")).toBe("2026-05-31");
    expect(dateVersIso("2026-05-31T14:30:00.000Z")).toBe("2026-05-31");
  });
  it("null si illisible ou absente", () => {
    expect(dateVersIso("bientot")).toBeNull();
    expect(dateVersIso("")).toBeNull();
    expect(dateVersIso(undefined)).toBeNull();
  });
});
