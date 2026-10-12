import { DataSource } from "typeorm";

import { Match } from "@/features/matchs/match.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { StatsService } from "@/features/stats/stats.service";

describe("StatsService.bilanClub", () => {
  let ds: DataSource;
  let svc: StatsService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new StatsService(ds.getRepository(Match));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  async function contexte() {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s25 = await f.saison("2025-2026", 2025);
    const s26 = await f.saison("2026-2027", 2026);
    const seniors25 = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s25.id });
    const u20 = await f.equipe({ clubId: moi.id, nom: "U20", saisonId: s25.id });
    const seniors26 = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s26.id });
    const match = (eq: { id: string }, saisonId: string, sd: number, se: number, dom = true) => f.match({
      clubDom: dom ? moi.id : adv.id, clubExt: dom ? adv.id : moi.id,
      equipeDomId: dom ? eq.id : undefined, equipeExtId: dom ? undefined : eq.id,
      saisonId, scoreDom: sd, scoreExt: se, statut: "joue",
    });
    await match(seniors25, s25.id, 2, 0);          // V
    await match(seniors25, s25.id, 1, 1, false);   // N (a l'exterieur)
    await match(u20, s25.id, 0, 3);                // D
    await match(seniors26, s26.id, 4, 1);          // V
    return { moi, s25, s26, seniors25, u20 };
  }

  it("sans perimetre : tout le club", async () => {
    const c = await contexte();
    expect(await svc.bilanClub(c.moi.id)).toMatchObject({ joues: 4, v: 2, n: 1, d: 1, bp: 7, bc: 5 });
  });

  it("par saison", async () => {
    const c = await contexte();
    expect(await svc.bilanClub(c.moi.id, { saisonId: c.s25.id })).toMatchObject({ joues: 3, v: 1, n: 1, d: 1 });
    expect(await svc.bilanClub(c.moi.id, { saisonId: c.s26.id })).toMatchObject({ joues: 1, v: 1, bp: 4, bc: 1, pts: 3 });
  });

  it("par equipe (dom ou ext)", async () => {
    const c = await contexte();
    expect(await svc.bilanClub(c.moi.id, { equipeId: c.seniors25.id })).toMatchObject({ joues: 2, v: 1, n: 1, d: 0, forme: ["V", "N"] });
    expect(await svc.bilanClub(c.moi.id, { equipeId: c.u20.id })).toMatchObject({ joues: 1, d: 1 });
  });

  it("forme : les 5 derniers resultats dans l'ordre des dates, meme si les feuilles ont ete importees en desordre", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s25 = await f.saison("2025-2026", 2025);
    const seniors = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s25.id });
    // Importes du plus recent au plus ancien ; en chaines, "15/03/2026" passerait avant "27/09/2025".
    const jouer = (date: string, sd: number, se: number) => f.match({
      clubDom: moi.id, clubExt: adv.id, equipeDomId: seniors.id, saisonId: s25.id, date, scoreDom: sd, scoreExt: se, statut: "joue",
    });
    await jouer("15/03/2026", 0, 1);   // D  (7e)
    await jouer("08/03/2026", 2, 0);   // V  (6e)
    await jouer("01/03/2026", 1, 1);   // N  (5e)
    await jouer("22/02/2026", 3, 0);   // V  (4e)
    await jouer("15/02/2026", 0, 2);   // D  (3e)
    await jouer("27/09/2025", 4, 0);   // V  (1er)
    await jouer("11/10/2025", 1, 0);   // V  (2e)

    const bilan = await svc.bilanClub(moi.id);

    expect(bilan.forme).toEqual(["D", "V", "N", "V", "D"]);
  });
});
