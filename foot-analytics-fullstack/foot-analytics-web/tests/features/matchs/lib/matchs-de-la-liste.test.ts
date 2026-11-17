import { describe, expect, it } from "vitest";

import { matchsDeLaListe } from "@/features/matchs/lib/matchs-equipe";

const AUJ = new Date(2026, 10, 17);                     // 17/11/2026
const m = (id: string, date: string, extra: object = {}) => ({ id, journee: "1", date, clubDom: "a", clubExt: "b", equipeDomId: "mon", equipeExtId: "autre", scoreDom: 0, scoreExt: 0, statut: "prevu", ...extra }) as any;

describe("matchsDeLaListe : les joués et seulement le prochain à jouer", () => {
  const joue = m("j1", "2026-10-04", { statut: "joue", scoreDom: 2, scoreExt: 1 });
  const joue2 = m("j2", "2026-10-18", { statut: "joue", scoreDom: 0, scoreExt: 0 });         // 0-0 marqué joué : reste un match joué
  const proche = m("p1", "2026-11-22");
  const lointain = m("p2", "2026-11-29");
  const encoreApres = m("p3", "2026-12-06");

  it("garde tous les matchs joués et le seul prochain match de mon équipe", () => {
    const r = matchsDeLaListe([encoreApres, joue, lointain, proche, joue2], "mon", AUJ);
    expect(r.map((x) => x.id).sort()).toEqual(["j1", "j2", "p1"]);
  });

  it("le prochain est choisi par la date, pas par l'ordre de la liste ni par la journée", () => {
    const a = m("a", "2026-12-20", { journee: "9" }), b = m("b", "2026-11-25", { journee: "11" });
    expect(matchsDeLaListe([a, b], "mon", AUJ).map((x) => x.id)).toEqual(["b"]);
  });

  it("un match dont la date est passée sans feuille reste visible (il attend son import), à côté du prochain", () => {
    const attend = m("att", "2026-11-08");
    expect(matchsDeLaListe([attend, proche, lointain], "mon", AUJ).map((x) => x.id).sort()).toEqual(["att", "p1"]);
  });

  it("ni annulé ni reporté ne sont « le prochain »", () => {
    const annule = m("an", "2026-11-19", { statut: "annule" });
    expect(matchsDeLaListe([annule, proche], "mon", AUJ).map((x) => x.id)).toEqual(["p1"]);
  });

  it("les matchs programmés des autres équipes de la poule ne s'affichent pas", () => {
    const autres = m("o1", "2026-11-22", { equipeDomId: "x", equipeExtId: "y" });
    expect(matchsDeLaListe([autres, proche, joue], "mon", AUJ).map((x) => x.id).sort()).toEqual(["j1", "p1"]);
  });

  it("sans équipe choisie : les joués seulement ; sans match à venir : tous les joués", () => {
    expect(matchsDeLaListe([joue, proche, lointain], null, AUJ).map((x) => x.id)).toEqual(["j1"]);
    expect(matchsDeLaListe([joue], "mon", AUJ).map((x) => x.id)).toEqual(["j1"]);
    expect(matchsDeLaListe([], "mon", AUJ)).toEqual([]);
  });

  it("un match programmé à la date du jour est le prochain", () => {
    expect(matchsDeLaListe([m("auj", "2026-11-17"), proche], "mon", AUJ).map((x) => x.id)).toEqual(["auj"]);
  });
});
