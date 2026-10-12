import { doublonsProgrammes, MatchDoublonnable, programmeIdentique } from "@/features/matchs/programme";

const m = (id: string, extra: Partial<MatchDoublonnable> = {}): MatchDoublonnable => ({
  id, clubDom: "moi", clubExt: "adv", date: "2026-11-22", statut: "prevu", numeroFmi: null, scoreDom: 0, scoreExt: 0, ...extra,
});
const ids = (l: { supprimer: { id: string } }[]) => l.map((x) => x.supprimer.id);

describe("doublonsProgrammes", () => {
  it("memes clubs, meme sens, meme jour : on garde le plus renseigne (equipe, saison, heure), les autres sont supprimes", () => {
    const fantome = m("fantome", { saisonId: null, equipeDomId: null });                    // cree par l'ancien calendrier : equipe et saison retirees
    const bon = m("bon", { equipeDomId: "eq", saisonId: "s", heure: "15:00" });
    const r = doublonsProgrammes([fantome, bon]);
    expect(ids(r)).toEqual(["fantome"]);
    expect(r[0].retenu.id).toBe("bon");
  });

  it("le meme jour dans deux formats (calendrier AAAA-MM-JJ, FMI JJ/MM/AAAA) est le meme jour", () => {
    expect(ids(doublonsProgrammes([m("a", { date: "2026-11-22", equipeDomId: "eq" }), m("b", { date: "22/11/2026" })]))).toEqual(["b"]);
  });

  it("a egalite de renseignement : le plus ancien est garde", () => {
    const r = doublonsProgrammes([
      m("recent", { createdAt: "2026-10-02T10:00:00Z" }), m("ancien", { createdAt: "2026-10-01T10:00:00Z" }), m("tard", { createdAt: "2026-10-03T10:00:00Z" }),
    ]);
    expect(ids(r).sort()).toEqual(["recent", "tard"]);
    expect(r.every((x) => x.retenu.id === "ancien")).toBe(true);
  });

  it("jamais : sens different, autre jour, autre club, match joue, feuille FMI, match reporte, jour illisible", () => {
    const base = m("base", { equipeDomId: "eq" });
    expect(doublonsProgrammes([base, m("sens", { clubDom: "adv", clubExt: "moi" })])).toEqual([]);
    expect(doublonsProgrammes([base, m("jour", { date: "2026-11-29" })])).toEqual([]);
    expect(doublonsProgrammes([base, m("club", { clubExt: "autre" })])).toEqual([]);
    expect(doublonsProgrammes([base, m("joue", { statut: "joue", scoreDom: 2, scoreExt: 1 })])).toEqual([]);
    expect(doublonsProgrammes([base, m("fmi", { statut: "prevu", numeroFmi: "123" })])).toEqual([]);
    expect(doublonsProgrammes([base, m("reporte", { statut: "reporte" })])).toEqual([]);
    expect(doublonsProgrammes([m("x", { date: null }), m("y", { date: null }), m("z", { date: "bientot" }), m("w", { date: "bientot" })])).toEqual([]);
  });

  it("un match avec score n'est pas un programme, meme si son statut est reste 'prevu'", () => {
    expect(doublonsProgrammes([m("a"), m("b", { scoreDom: 1, scoreExt: 0 })])).toEqual([]);
  });
});

describe("programmeIdentique", () => {
  const existants = [m("a", { date: "22/11/2026" }), m("b", { date: "2026-12-06" }), m("joue", { date: "2026-12-13", statut: "joue", scoreDom: 1 })];

  it("retrouve un match programme du meme jour et du meme sens, quel que soit le format de la date", () => {
    expect(programmeIdentique(existants, { clubDom: "moi", clubExt: "adv", date: "2026-11-22" })?.id).toBe("a");
    expect(programmeIdentique(existants, { clubDom: "moi", clubExt: "adv", date: "06/12/2026" })?.id).toBe("b");
  });

  it("sinon rien : autre jour, autre sens, match deja joue, date absente", () => {
    expect(programmeIdentique(existants, { clubDom: "moi", clubExt: "adv", date: "2026-11-23" })).toBeUndefined();
    expect(programmeIdentique(existants, { clubDom: "adv", clubExt: "moi", date: "2026-11-22" })).toBeUndefined();
    expect(programmeIdentique(existants, { clubDom: "moi", clubExt: "adv", date: "2026-12-13" })).toBeUndefined();
    expect(programmeIdentique(existants, { clubDom: "moi", clubExt: "adv" })).toBeUndefined();
  });
});
