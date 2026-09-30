import { NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Coach, StaffMatch } from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { CoachsService } from "./coachs.module";

describe("CoachsService.fiche", () => {
  let ds: DataSource;
  let svc: CoachsService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new CoachsService(ds.getRepository(Coach), ds.getRepository(StaffMatch));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  async function contexte() {
    const s25 = await f.saison("2025-2026", 2025);
    const s26 = await f.saison("2026-2027", 2026, { actif: true });
    const mions = await f.club("Mions");
    const ol = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const coach = await ds.getRepository(Coach).save({ nom: "MARTIN", prenom: "Luc", licence: "C1", clubId: mions.id, cartonsJaunes: 2, cartonsRouges: 0, motifsTop: "Contestation" });
    const banc = async (club: { id: string }, saisonId: string, date: string, sd: number, se: number, fonctions = "E", statut = "joue") => {
      const m = await f.match({ clubDom: club.id, clubExt: adv.id, saisonId, date, scoreDom: sd, scoreExt: se, statut });
      await ds.getRepository(StaffMatch).save({ matchId: m.id, coachId: coach.id, cote: "dom", fonctions });
      return m;
    };
    return { s25, s26, mions, ol, adv, coach, banc };
  }

  it("fiche : bilans par saison et club, parcours Mions puis OL, club actuel le plus recent", async () => {
    const c = await contexte();
    await c.banc(c.mions, c.s25.id, "07/09/2025", 2, 0);
    await c.banc(c.mions, c.s25.id, "14/09/2025", 0, 1);
    await c.banc(c.ol, c.s26.id, "06/09/2026", 1, 1);

    const fiche = await svc.fiche(c.coach.id);

    expect(fiche.coach).toMatchObject({ id: c.coach.id, nom: "MARTIN", clubId: c.ol.id, cartonsJaunes: 2 });
    expect(fiche.bilan).toMatchObject({ matchs: 3, v: 1, n: 1, d: 1 });
    expect(fiche.parSaison.map((s) => [s.saisonNom, s.clubId, s.bilan.matchs])).toEqual([
      ["2026-2027", c.ol.id, 1], ["2025-2026", c.mions.id, 2],
    ]);
    expect(fiche.parcours.map((p) => p.clubId)).toEqual([c.ol.id, c.mions.id]);
    expect(fiche.matchs[0].date).toBe("06/09/2026");
  });

  it("portee saison : bilan et matchs de cette saison seulement", async () => {
    const c = await contexte();
    await c.banc(c.mions, c.s25.id, "07/09/2025", 2, 0);
    await c.banc(c.ol, c.s26.id, "06/09/2026", 0, 3);

    const fiche = await svc.fiche(c.coach.id, c.s26.id);

    expect(fiche.bilan).toMatchObject({ matchs: 1, d: 1 });
    expect(fiche.matchs).toHaveLength(1);
    expect(fiche.parSaison).toHaveLength(2);
  });

  it("match programme et delegue de rencontre ne comptent pas", async () => {
    const c = await contexte();
    await c.banc(c.ol, c.s26.id, "06/09/2026", 1, 0);
    await c.banc(c.ol, c.s26.id, "25/10/2026", 0, 0, "E", "prevu");
    await c.banc(c.ol, c.s26.id, "01/11/2026", 3, 0, "DR");

    expect((await svc.fiche(c.coach.id)).bilan.matchs).toBe(1);
  });

  it("coach inconnu : 404", async () => {
    await expect(svc.fiche("inconnu")).rejects.toBeInstanceOf(NotFoundException);
  });
});
