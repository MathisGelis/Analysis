import { describe, expect, it } from "vitest";
import { liensDeSaison, parsePortee, participationsDeSaison, totauxDepuis } from "./arbitre-portee";

const p = (saisonId: string, o: Record<string, any> = {}) => ({
  saisonId, matchsOfficies: 10, matchsPrincipal: 5, cartonsJaunesDonnes: 20, cartonsRougesDonnes: 1, ...o,
});

describe("parsePortee", () => {
  it("saison par defaut, carriere seulement sur demande explicite", () => {
    expect(parsePortee(undefined)).toBe("saison");
    expect(parsePortee("nimporte")).toBe("saison");
    expect(parsePortee("carriere")).toBe("carriere");
    expect(parsePortee(["carriere", "saison"])).toBe("carriere");
  });
});

describe("filtrage par saison", () => {
  it("participations et liens de la saison uniquement", () => {
    expect(participationsDeSaison([p("s1"), p("s2")], "s2")).toHaveLength(1);
    expect(liensDeSaison([{ matchData: { saisonId: "s1" } }, { matchData: null }], "s1")).toHaveLength(1);
  });
});

describe("totauxDepuis", () => {
  it("somme les championnats, profil du championnat le plus arbitre en principal, note moyenne des liens notes", () => {
    const t = totauxDepuis(
      [p("s1", { matchsPrincipal: 2, profil: "Permissif" }), p("s1", { matchsPrincipal: 9, profil: "Strict", motifsTop: "Antisportif" })],
      [{ note: 6 }, { note: 8 }, { note: null }],
    );
    expect(t).toMatchObject({ matchsOfficies: 20, cartonsJaunesDonnes: 40, cartonsRougesDonnes: 2, noteMoyenne: 7, profil: "Strict", motifsTop: "Antisportif" });
  });
  it("aucune participation : zeros et valeurs nulles", () => {
    expect(totauxDepuis([], [])).toEqual({ matchsOfficies: 0, cartonsJaunesDonnes: 0, cartonsRougesDonnes: 0, noteMoyenne: null, profil: null, motifsTop: null });
  });
});
