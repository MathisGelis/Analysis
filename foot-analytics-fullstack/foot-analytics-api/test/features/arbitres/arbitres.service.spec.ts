import { DataSource } from "typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { ArbitresService } from "@/features/arbitres/arbitres.service";

describe("ArbitresService.nettoyerDelegues", () => {
  let ds: DataSource;
  let svc: ArbitresService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new ArbitresService(ds.getRepository(Arbitre), ds.getRepository(ArbitreMatch));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  /** Un vrai arbitre (principal + assistant), un delegue pur, et un arbitre aussi enregistre "autre". */
  async function jeu() {
    const club = await f.club("A");
    const m1 = await f.match({ clubDom: club.id, clubExt: club.id });
    const m2 = await f.match({ clubDom: club.id, clubExt: club.id });
    const vrai = await svc.create({ nom: "FARGEOT", prenom: "Jeremy" } as any);
    const delegue = await svc.create({ nom: "PAVIOLO", prenom: "Sebastien" } as any);
    const mixte = await svc.create({ nom: "LEVANTI", prenom: "Serge" } as any);
    const lien = (matchId: string, arbitreId: string, role: string) =>
      ds.getRepository(ArbitreMatch).save({ matchId, arbitreId, role } as any);
    await lien(m1.id, vrai.id, "principal");
    await lien(m2.id, vrai.id, "principal");
    await lien(m1.id, delegue.id, "autre");
    await lien(m2.id, delegue.id, "autre");
    await lien(m1.id, mixte.id, "assistant1");
    await lien(m2.id, mixte.id, "autre");
    return { vrai, delegue, mixte };
  }
  const nbLiens = () => ds.getRepository(ArbitreMatch).count();

  it("simulation par defaut : rien n'est modifie, le rapport dit ce qui serait supprime", async () => {
    await jeu();
    const r = await svc.nettoyerDelegues();

    expect(r).toMatchObject({ appliquer: false, liensAutre: 3, arbitresConcernes: 2, arbitresSupprimes: 1 });
    expect(r.exemples).toEqual(expect.arrayContaining([
      { arbitre: "Sebastien PAVIOLO", liensAutre: 2, supprime: true },
      { arbitre: "Serge LEVANTI", liensAutre: 1, supprime: false },
    ]));
    expect(await nbLiens()).toBe(6);
    expect(await ds.getRepository(Arbitre).count()).toBe(3);
  });

  it("application : supprime les liens 'autre', le delegue pur, et epargne les vrais roles", async () => {
    const { vrai, delegue, mixte } = await jeu();

    const r = await svc.nettoyerDelegues(true);

    expect(r).toMatchObject({ appliquer: true, liensAutre: 3, arbitresSupprimes: 1 });
    expect(await nbLiens()).toBe(3);
    const restants = (await ds.getRepository(Arbitre).find()).map((a) => a.id).sort();
    expect(restants).toEqual([vrai.id, mixte.id].sort());
    expect(restants).not.toContain(delegue.id);
    expect((await ds.getRepository(ArbitreMatch).find({ where: { arbitreId: mixte.id } })).map((l) => l.role))
      .toEqual(["assistant1"]);
  });

  it("idempotent : un second passage ne trouve plus rien", async () => {
    await jeu();
    await svc.nettoyerDelegues(true);
    expect(await svc.nettoyerDelegues(true)).toMatchObject({ liensAutre: 0, arbitresConcernes: 0 });
  });
});
