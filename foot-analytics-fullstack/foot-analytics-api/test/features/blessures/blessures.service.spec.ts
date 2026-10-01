import { ConflictException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Blessure } from "@/features/blessures/blessure.entity";
import { creerBaseTest } from "@test/support/test-db";
import { BlessuresService } from "@/features/blessures/blessures.service";

describe("BlessuresService - chevauchements", () => {
  let ds: DataSource;
  let svc: BlessuresService;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new BlessuresService(ds.getRepository(Blessure));
  });
  afterEach(() => ds.destroy());

  const mars = { joueurId: "j1", localisation: "Cheville droite", dateDebut: "2026-03-01", retourEstime: "2026-03-31", statut: "Retabli" };

  it("accepte une premiere blessure", async () => {
    const b = await svc.create(mars);
    expect(b.id).toBeDefined();
  });

  it("refuse (409) une blessure qui chevauche une autre du meme joueur", async () => {
    await svc.create(mars);
    const tentative = svc.create({ ...mars, localisation: "Epaule gauche", dateDebut: "2026-03-20", retourEstime: "2026-04-10" });
    await expect(tentative).rejects.toBeInstanceOf(ConflictException);
    await expect(tentative).rejects.toMatchObject({
      response: { code: "BLESSURE_CHEVAUCHANTE", conflits: [expect.objectContaining({ memeZone: false })] },
    });
  });

  it("signale memeZone quand la localisation est identique (probable doublon)", async () => {
    await svc.create(mars);
    await expect(svc.create({ ...mars, dateDebut: "2026-03-10", retourEstime: "2026-03-12" }))
      .rejects.toMatchObject({ response: { conflits: [expect.objectContaining({ memeZone: true })] } });
  });

  it("accepte le chevauchement confirme (forcer)", async () => {
    await svc.create(mars);
    const b = await svc.create({ ...mars, localisation: "Epaule gauche", dateDebut: "2026-03-20", retourEstime: "2026-04-10", forcer: true });
    expect(b.id).toBeDefined();
    expect((b as any).forcer).toBeUndefined();
    expect(await svc.findAll("j1")).toHaveLength(2);
  });

  it("accepte des periodes disjointes et des joueurs differents", async () => {
    await svc.create(mars);
    await svc.create({ ...mars, dateDebut: "2026-05-01", retourEstime: "2026-05-15" });
    await svc.create({ ...mars, joueurId: "j2" });
    expect(await svc.findAll()).toHaveLength(3);
  });

  it("une blessure en cours bloque toute nouvelle blessure ulterieure", async () => {
    await svc.create({ joueurId: "j1", localisation: "Genou droit", dateDebut: "2026-03-01", statut: "Indisponible" });
    await expect(svc.create({ ...mars, dateDebut: "2026-06-01", retourEstime: "2026-06-10" }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("modifier une blessure ne la compare pas a elle-meme", async () => {
    const b = await svc.create(mars);
    const maj = await svc.update(b.id, { details: "IRM prevu", retourEstime: "2026-04-05" });
    expect(maj.details).toBe("IRM prevu");
  });

  it("modifier une blessure vers une periode qui en chevauche une autre est refuse", async () => {
    await svc.create(mars);
    const avril = await svc.create({ ...mars, dateDebut: "2026-04-10", retourEstime: "2026-04-20" });
    await expect(svc.update(avril.id, { dateDebut: "2026-03-15" })).rejects.toBeInstanceOf(ConflictException);
  });
});
