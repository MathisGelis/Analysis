import { DataSource } from "typeorm";
import { RapportScouting, Saison } from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { ScoutingService } from "./scouting.module";

describe("ScoutingService (saison)", () => {
  let ds: DataSource;
  let svc: ScoutingService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new ScoutingService(ds.getRepository(RapportScouting), ds.getRepository(Saison));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  async function contexte() {
    const club = await f.club("Neuville");
    const s25 = await f.saison("2025-2026", 2025);
    const s26 = await f.saison("2026-2027", 2026, { actif: true });
    const rapport = (date: string | undefined, equipeNom = "Neuville") =>
      ds.getRepository(RapportScouting).save({ clubId: club.id, equipeNom, date } as any);
    return { club, s25, s26, rapport };
  }

  it("sans saison : le plus recent (dates jj/mm/aaaa comparees comme des dates)", async () => {
    const c = await contexte();
    await c.rapport("27/09/2025");
    const recent = await c.rapport("15/01/2026");
    expect((await svc.findLatestByClub(c.club.id))?.id).toBe(recent.id);
  });

  it("avec saison : seuls les rapports dates dans cette saison", async () => {
    const c = await contexte();
    const r25 = await c.rapport("15/01/2026");
    const r26 = await c.rapport("2026-09-12");
    expect((await svc.findLatestByClub(c.club.id, c.s25.id))?.id).toBe(r25.id);
    expect((await svc.findLatestByClub(c.club.id, c.s26.id))?.id).toBe(r26.id);
    expect((await svc.findAll(c.club.id, c.s25.id)).map((r) => r.id)).toEqual([r25.id]);
  });

  it("saison sans rapport : null (placeholder), jamais celui d'une autre saison", async () => {
    const c = await contexte();
    await c.rapport("15/01/2026");
    expect(await svc.findLatestByClub(c.club.id, c.s26.id)).toBeNull();
    expect(await svc.findAll(undefined, c.s26.id)).toEqual([]);
  });

  it("rapport sans date lisible : uniquement sur la saison active", async () => {
    const c = await contexte();
    const sansDate = await c.rapport(undefined);
    expect((await svc.findLatestByClub(c.club.id, c.s26.id))?.id).toBe(sansDate.id);
    expect(await svc.findLatestByClub(c.club.id, c.s25.id)).toBeNull();
  });

  it("saison inconnue : aucun rapport", async () => {
    const c = await contexte();
    await c.rapport("15/01/2026");
    expect(await svc.findAll(c.club.id, "inconnue")).toEqual([]);
  });
});
