import { coteDe, MatchSituation, plusRecentsDAbord, systemeDe, versDernierMatch } from "./situation-equipe";

const match = (id: string, date: string, extra: Partial<MatchSituation> = {}): MatchSituation => ({
  id, date, journee: null, clubDom: "moi", clubExt: "adv", equipeDomId: "eq", equipeExtId: "eq-adv", scoreDom: 1, scoreExt: 0, ...extra,
});
const cible = { clubId: "moi", equipeId: "eq" };

describe("coteDe", () => {
  it("par equipe, sinon par club", () => {
    expect(coteDe(match("a", "01/09/2025"), cible)).toBe("dom");
    expect(coteDe(match("a", "01/09/2025", { clubDom: "adv", clubExt: "moi", equipeDomId: "eq-adv", equipeExtId: "eq" }), cible)).toBe("ext");
    expect(coteDe(match("a", "01/09/2025", { clubDom: "adv", clubExt: "moi" }), { clubId: "moi", equipeId: null })).toBe("ext");
  });
});

describe("systemeDe", () => {
  it("dispositif d'apres les seuls matchs renseignes, vus du cote de la cible ; le plus recent pese le plus", () => {
    const matchs = [
      match("m1", "07/09/2025", { formationDom: "4-3-3" }),
      match("m2", "14/09/2025", { clubDom: "adv", clubExt: "moi", equipeDomId: "eq-adv", equipeExtId: "eq", formationExt: "3-5-2", formationDom: "4-4-2" }),
      match("m3", "21/09/2025", { formationDom: "3-5-2" }),
      match("m4", "28/09/2025"),
    ];
    const s = systemeDe(matchs, cible);
    expect(s).toMatchObject({ observes: 3, matchs: 4, dernierMatchId: "m4" });
    expect(s.prediction).toMatchObject({ systeme: "3-5-2", observations: 3 });
  });

  it("aucun dispositif renseigne, ou seulement le couple ecrit en dur par l'ancien import : pas de prediction", () => {
    const inventes = [match("m1", "07/09/2025", { formationDom: "4-4-2", formationExt: "4-2-3-1" })];
    expect(systemeDe(inventes, cible)).toMatchObject({ prediction: null, observes: 0, matchs: 1 });
    expect(systemeDe([], cible)).toMatchObject({ prediction: null, observes: 0, matchs: 0, dernierMatchId: null });
  });

  it("le dernier match tient compte des dates, pas de l'ordre de la liste", () => {
    const s = systemeDe([match("recent", "15/03/2026"), match("ancien", "27/09/2025")], cible);
    expect(s.dernierMatchId).toBe("recent");
  });
});

describe("versDernierMatch / plusRecentsDAbord", () => {
  it("score et issue de mon point de vue, adversaire, dispositif de mon cote", () => {
    const m = match("m", "07/09/2025", { clubDom: "adv", clubExt: "moi", equipeDomId: "eq-adv", equipeExtId: "eq", scoreDom: 2, scoreExt: 2, formationExt: "4-3-3", formationDom: "5-3-2" });
    expect(versDernierMatch(m, cible)).toMatchObject({ domicile: false, adversaireId: "adv", bp: 2, bc: 2, issue: "N", formation: "4-3-3" });
  });

  it("dispositif non renseigne : null, jamais une valeur par defaut", () => {
    expect(versDernierMatch(match("m", "07/09/2025"), cible).formation).toBeNull();
  });

  it("les plus recents d'abord (dates en jj/mm/aaaa, pas comparees comme des chaines)", () => {
    const l = plusRecentsDAbord([match("a", "27/09/2025"), match("b", "15/03/2026"), match("c", "01/12/2025")]);
    expect(l.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });
});
