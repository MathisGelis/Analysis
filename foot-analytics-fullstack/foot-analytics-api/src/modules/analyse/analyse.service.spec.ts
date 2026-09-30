import { DataSource } from "typeorm";
import { Club, Coach, Composition, Entrainement, EvenementMatch, Joueur, Match, StaffMatch } from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { AnalyseService } from "./analyse.module";

describe("AnalyseService.rapportClub", () => {
  let ds: DataSource;
  let svc: AnalyseService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new AnalyseService(
      ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Joueur),
      ds.getRepository(Composition), ds.getRepository(EvenementMatch), ds.getRepository(Entrainement),
      ds.getRepository(Coach), ds.getRepository(StaffMatch),
    );
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  /** Mon club : Seniors (2 matchs en 25-26, 1 en 26-27) + U20 (1 match en 25-26). */
  async function contexte() {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s25 = await f.saison("2025-2026", 2025);
    const s26 = await f.saison("2026-2027", 2026);
    const seniors25 = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s25.id });
    const u20 = await f.equipe({ clubId: moi.id, nom: "U20", categorie: "U20", saisonId: s25.id });
    const seniors26 = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s26.id });
    const advEq = await f.equipe({ clubId: adv.id, nom: "Adverse", categorie: "Seniors", saisonId: s25.id });
    await f.joueur({ nom: "SENIOR", prenom: "Ali", clubId: moi.id });
    await f.joueur({ nom: "JUNIOR", prenom: "Bob", clubId: moi.id });
    const jouer = async (eq: { id: string }, saisonId: string, nom: string, prenom: string, sd = 2, se = 0) => {
      const m = await f.match({ clubDom: moi.id, clubExt: adv.id, equipeDomId: eq.id, equipeExtId: advEq.id, saisonId, scoreDom: sd, scoreExt: se });
      await f.compo({ matchId: m.id, cote: "dom", nom, prenom });
      return m;
    };
    await jouer(seniors25, s25.id, "SENIOR", "Ali");
    await jouer(seniors25, s25.id, "SENIOR", "Ali");
    await jouer(u20, s25.id, "JUNIOR", "Bob");
    await jouer(seniors26, s26.id, "SENIOR", "Ali");
    return { moi, s25, s26, seniors25, u20, seniors26 };
  }

  it("sans perimetre : tous les matchs du club (comportement historique)", async () => {
    const c = await contexte();
    expect((await svc.rapportClub(c.moi.id)).matchsAnalyses).toBe(4);
  });

  it("par equipe : seuls les matchs de cette equipe, donc de sa saison", async () => {
    const c = await contexte();
    expect((await svc.rapportClub(c.moi.id, { equipeId: c.seniors25.id })).matchsAnalyses).toBe(2);
    expect((await svc.rapportClub(c.moi.id, { equipeId: c.u20.id })).matchsAnalyses).toBe(1);
    expect((await svc.rapportClub(c.moi.id, { equipeId: c.seniors26.id })).matchsAnalyses).toBe(1);
  });

  it("par saison : toutes les equipes du club sur cette saison", async () => {
    const c = await contexte();
    expect((await svc.rapportClub(c.moi.id, { saisonId: c.s25.id })).matchsAnalyses).toBe(3);
    expect((await svc.rapportClub(c.moi.id, { saisonId: c.s26.id })).matchsAnalyses).toBe(1);
  });

  it("les joueurs absents du perimetre ne figurent pas dans le tableau d'impact", async () => {
    const c = await contexte();
    const r = await svc.rapportClub(c.moi.id, { equipeId: c.seniors25.id });
    expect(r.impacts.map((i) => i.nom)).toEqual(["SENIOR"]);
  });

  it("equipe sans match : rapport vide, sans planter", async () => {
    const c = await contexte();
    const vide = await f.equipe({ clubId: c.moi.id, nom: "Seniors 2", categorie: "Seniors", saisonId: c.s26.id });
    const r = await svc.rapportClub(c.moi.id, { equipeId: vide.id });
    expect(r.matchsAnalyses).toBe(0);
    expect(r.impacts).toEqual([]);
  });

  it("club inconnu : 404", async () => {
    await expect(svc.rapportClub("inconnu")).rejects.toThrow(/introuvable/);
  });
});
