import { BadRequestException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Composition, EvenementMatch, Match } from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { MatchsService, UpdateMatchDto } from "./matchs.module";

describe("MatchsService : dispositifs", () => {
  let ds: DataSource;
  let svc: MatchsService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new MatchsService(ds.getRepository(Match), ds.getRepository(Composition), ds.getRepository(EvenementMatch));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  async function unMatch(extra: Partial<Match> = {}) {
    const a = await f.club("A");
    const b = await f.club("B");
    return f.match({ clubDom: a.id, clubExt: b.id, ...extra });
  }

  it("saisie d'un dispositif : espaces retires, enregistre pour chaque cote", async () => {
    const m = await unMatch();

    const r = await svc.update(m.id, { formationDom: " 4 - 3 - 3 ", formationExt: "3-5-2" } as any);

    expect(r).toMatchObject({ formationDom: "4-3-3", formationExt: "3-5-2" });
  });

  it("PATCH partiel : le DTO de mise a jour n'exige ni clubDom ni clubExt (saisie d'un seul dispositif)", async () => {
    const { ValidationPipe } = await import("@nestjs/common");
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const valide = await pipe.transform({ formationDom: "4-3-3" }, { type: "body", metatype: UpdateMatchDto });
    expect(valide).toMatchObject({ formationDom: "4-3-3" });
  });

  it("dispositif invalide : refuse (400), rien n'est enregistre", async () => {
    const m = await unMatch({ formationDom: "4-4-2" });

    await expect(svc.update(m.id, { formationDom: "4-4-3" } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.update(m.id, { formationExt: "bonjour" } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect((await ds.getRepository(Match).findOneByOrFail({ id: m.id })).formationDom).toBe("4-4-2");
  });

  it("chaine vide : efface le dispositif", async () => {
    const m = await unMatch({ formationDom: "4-4-2", formationExt: "3-5-2" });

    const r = await svc.update(m.id, { formationDom: "" } as any);

    expect(r.formationDom).toBeNull();
    expect(r.formationExt).toBe("3-5-2");
  });

  it("creation d'un match avec dispositif : meme validation", async () => {
    const a = await f.club("A");
    const b = await f.club("B");
    await expect(svc.create({ clubDom: a.id, clubExt: b.id, formationDom: "9-9" } as any)).rejects.toBeInstanceOf(BadRequestException);
    const ok = await svc.create({ clubDom: a.id, clubExt: b.id, formationDom: "4-3-3" } as any);
    expect(ok.formationDom).toBe("4-3-3");
  });

  it("le couple 4-4-2 / 4-2-3-1 de l'ancien import est lu comme 'non renseigne' (liste et fiche)", async () => {
    const m = await unMatch({ formationDom: "4-4-2", formationExt: "4-2-3-1" });

    expect(await svc.findOne(m.id)).toMatchObject({ formationDom: null, formationExt: null });
    const liste = await svc.findAll();
    expect(liste.find((x) => x.id === m.id)).toMatchObject({ formationDom: null, formationExt: null });
    // En base, rien n'a change : l'effacement est une operation de maintenance explicite.
    expect(await ds.getRepository(Match).findOneByOrFail({ id: m.id })).toMatchObject({ formationDom: "4-4-2", formationExt: "4-2-3-1" });
  });

  it("un dispositif reellement saisi n'est jamais masque, meme s'il vaut l'un des deux du couple", async () => {
    const m = await unMatch({ formationDom: "4-4-2", formationExt: "3-5-2" });

    expect(await svc.findOne(m.id)).toMatchObject({ formationDom: "4-4-2", formationExt: "3-5-2" });
  });
});
