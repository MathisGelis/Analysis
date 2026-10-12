import { DataSource } from "typeorm";

import { Match } from "@/features/matchs/match.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { chargerDetailsMatchs } from "@/features/matchs/details-matchs";

describe("chargerDetailsMatchs", () => {
  let ds: DataSource;
  let f: ReturnType<typeof fabriques>;
  beforeEach(async () => { ds = await creerBaseTest(); f = fabriques(ds); });
  afterEach(() => ds.destroy());

  async function deuxMatchs() {
    const a = await f.club("A");
    const b = await f.club("B");
    const m1 = await f.match({ clubDom: a.id, clubExt: b.id });
    const m2 = await f.match({ clubDom: b.id, clubExt: a.id });
    const m3 = await f.match({ clubDom: a.id, clubExt: b.id });
    await f.compo({ matchId: m1.id, cote: "dom", nom: "UN" });
    await f.compo({ matchId: m1.id, cote: "ext", nom: "DEUX" });
    await f.compo({ matchId: m2.id, cote: "dom", nom: "TROIS" });
    await f.evenement({ matchId: m1.id, type: "but", joueur: "UN", equipe: "dom", minute: 10 });
    await f.evenement({ matchId: m2.id, type: "carton", joueur: "TROIS", equipe: "dom", minute: 20 });
    await f.evenement({ matchId: m2.id, type: "but", joueur: "TROIS", equipe: "dom", minute: 30 });
    return [m1, m2, m3];
  }

  it("rattache a chaque match ses compositions et ses evenements, sans melange", async () => {
    const [m1, m2, m3] = await deuxMatchs();
    const matchs = await ds.getRepository(Match).find();

    await chargerDetailsMatchs(matchs, ds.manager);

    const par = (id: string) => matchs.find((m) => m.id === id)!;
    expect(par(m1.id).compositions.map((c) => c.nom).sort()).toEqual(["DEUX", "UN"]);
    expect(par(m1.id).evenements).toHaveLength(1);
    expect(par(m2.id).compositions.map((c) => c.nom)).toEqual(["TROIS"]);
    expect(par(m2.id).evenements.map((e) => e.type).sort()).toEqual(["but", "carton"]);
    // Un match sans rien : tableaux vides, pas undefined.
    expect(par(m3.id)).toMatchObject({ compositions: [], evenements: [] });
  });

  it("par lots : meme resultat quand les identifiants depassent la taille d'un lot", async () => {
    await deuxMatchs();
    const matchs = await ds.getRepository(Match).find();

    await chargerDetailsMatchs(matchs, ds.manager, 1);

    expect(matchs.reduce((s, m) => s + m.compositions.length, 0)).toBe(3);
    expect(matchs.reduce((s, m) => s + m.evenements.length, 0)).toBe(3);
  });

  it("aucun match : rien a charger", async () => {
    expect(await chargerDetailsMatchs([], ds.manager)).toEqual([]);
  });
});
