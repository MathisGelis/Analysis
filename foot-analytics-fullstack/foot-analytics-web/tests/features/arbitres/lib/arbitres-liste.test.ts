import { describe, expect, it } from "vitest";

import { groupeArbitre, lireParticipations, participationDuChampionnat, restreindreAuChampionnat, trierArbitres } from "@/features/arbitres/lib/arbitres-liste";

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

describe("trierArbitres", () => {
  const a = (nom: string, matchsPrincipal: number, matchsOfficies: number) => ({ nom, _stats: { matchsPrincipal, matchsOfficies } });
  const noms = (l: { nom: string }[]) => l.map((x) => x.nom);

  it("les principaux d'abord, du plus au moins de matchs au centre", () => {
    const l = [a("ASSIST", 0, 20), a("PEU", 1, 12), a("BEAUCOUP", 9, 9), a("MOYEN", 4, 15)];
    expect(noms(trierArbitres(l))).toEqual(["BEAUCOUP", "MOYEN", "PEU", "ASSIST"]);
  });

  it("un assistant tres sollicite ne passe jamais devant un principal", () => {
    expect(noms(trierArbitres([a("ASSIST", 0, 40), a("PRINC", 1, 1)]))).toEqual(["PRINC", "ASSIST"]);
  });

  it("apres les principaux : ceux qui n'ont officie qu'en assistant, par nombre de matchs puis A-Z", () => {
    const l = [a("ZED", 0, 5), a("ABEL", 0, 5), a("MAX", 0, 8)];
    expect(noms(trierArbitres(l))).toEqual(["MAX", "ABEL", "ZED"]);
  });

  it("egalite de matchs au centre : le plus de matchs officies, puis A-Z", () => {
    const l = [a("B", 3, 5), a("A", 3, 9), a("C", 3, 5)];
    expect(noms(trierArbitres(l))).toEqual(["A", "B", "C"]);
  });

  it("groupeArbitre : principal des un match au centre", () => {
    expect(groupeArbitre({ matchsPrincipal: 1, matchsOfficies: 1 })).toBe("principal");
    expect(groupeArbitre({ matchsPrincipal: 0, matchsOfficies: 6 })).toBe("autres");
  });

  it("ne modifie pas la liste d'origine", () => {
    const l = [a("B", 0, 1), a("A", 2, 2)];
    trierArbitres(l);
    expect(noms(l)).toEqual(["B", "A"]);
  });
});
