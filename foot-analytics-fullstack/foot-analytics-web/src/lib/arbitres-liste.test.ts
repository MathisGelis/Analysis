import { describe, expect, it } from "vitest";
import { lireParticipations, participationDuChampionnat, restreindreAuChampionnat } from "@/lib/arbitres-liste";

const part = (saisonId: string, poule: string | null, extra = {}) =>
  ({ saisonId, competitionLibelle: "Seniors D2", poule, matchsOfficies: 3, ...extra });
const arbitre = (id: string, parts: unknown[] | string | null) =>
  ({ id, nom: id, participations: typeof parts === "string" || parts === null ? parts : JSON.stringify(parts) });
const champ = { saisonId: "s25", competitionLibelle: "Seniors D2", poule: "C" };

describe("restreindreAuChampionnat", () => {
  it("ne garde que les arbitres du championnat, avec leur seule participation utile", () => {
    const liste = [
      arbitre("a", [part("s24", "C"), part("s25", "C", { matchsOfficies: 7 }), part("s25", "A")]),
      arbitre("b", [part("s25", "A")]),
      arbitre("c", []),
      arbitre("d", null),
    ];
    const r = restreindreAuChampionnat(liste, champ);
    expect(r.map((a) => a.id)).toEqual(["a"]);
    const parts = JSON.parse(r[0].participations!);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ saisonId: "s25", poule: "C", matchsOfficies: 7 });
  });

  it("sans championnat : tous les arbitres, participations retirees", () => {
    const r = restreindreAuChampionnat([arbitre("a", [part("s25", "C")]), arbitre("b", null)], null);
    expect(r.map((a) => a.id)).toEqual(["a", "b"]);
    expect(r.every((a) => a.participations === null)).toBe(true);
  });

  it("JSON illisible : l'arbitre est ecarte sans planter", () => {
    expect(restreindreAuChampionnat([arbitre("a", "{pas du json")], champ)).toEqual([]);
  });

  it("poule ou competition absentes : comparees comme null des deux cotes", () => {
    const sansPoule = { saisonId: "s25", competitionLibelle: null, poule: null };
    const parts = [{ saisonId: "s25", competitionLibelle: null, poule: null, matchsOfficies: 2 }];
    expect(participationDuChampionnat(parts, sansPoule)).toBeDefined();
    expect(participationDuChampionnat(parts, champ)).toBeUndefined();
  });
});

describe("lireParticipations", () => {
  it("absent ou invalide : liste vide", () => {
    expect(lireParticipations(null)).toEqual([]);
    expect(lireParticipations("[")).toEqual([]);
  });
});
