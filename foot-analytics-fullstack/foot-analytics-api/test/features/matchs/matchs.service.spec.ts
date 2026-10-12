import { BadRequestException, ConflictException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Composition } from "@/features/matchs/composition.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Match } from "@/features/matchs/match.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { MatchsService } from "@/features/matchs/matchs.service";
import { UpdateMatchDto, UpsertMatchDto } from "@/features/matchs/matchs.dto";

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

describe("Creation d'un match depuis le calendrier", () => {
  let ds: DataSource;
  let svc: MatchsService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new MatchsService(ds.getRepository(Match), ds.getRepository(Composition), ds.getRepository(EvenementMatch));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  /** Le corps que le calendrier envoie, tel que la validation globale de l'API le traite (whitelist). */
  async function valide(corps: object, metatype: new () => object) {
    const { ValidationPipe } = await import("@nestjs/common");
    return new ValidationPipe({ whitelist: true, transform: true }).transform(corps, { type: "body", metatype });
  }

  it("l'equipe et la saison survivent a la validation : sans elles le match n'apparait ni au calendrier ni au dashboard", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s = await f.saison("2026-2027", 2026, { actif: true });
    const eq = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s.id });

    const dto = await valide({
      date: "2026-10-18", heure: "15:00", journee: null, clubDom: moi.id, clubExt: adv.id,
      equipeDomId: eq.id, saisonId: s.id, competition: "Seniors D2", poule: "A", scoreDom: 0, scoreExt: 0, statut: "prevu",
    }, UpsertMatchDto) as UpsertMatchDto;
    const cree = await svc.create(dto);

    expect(cree).toMatchObject({ equipeDomId: eq.id, saisonId: s.id, statut: "prevu", date: "2026-10-18", clubExt: adv.id });
    const relu = await ds.getRepository(Match).findOneByOrFail({ id: cree.id });
    expect(relu.equipeDomId).toBe(eq.id);
  });

  it("match a l'exterieur : l'equipe est cote visiteur ; mise a jour : on peut aussi les corriger", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s = await f.saison("2026-2027", 2026, { actif: true });
    const eq = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s.id });
    const dto = await valide({ clubDom: adv.id, clubExt: moi.id, equipeExtId: eq.id, saisonId: s.id, statut: "prevu" }, UpsertMatchDto) as UpsertMatchDto;
    const cree = await svc.create(dto);
    expect(cree).toMatchObject({ equipeExtId: eq.id, saisonId: s.id });

    const maj = await valide({ equipeExtId: null as any, saisonId: s.id }, UpdateMatchDto) as UpdateMatchDto;
    expect(maj).toMatchObject({ saisonId: s.id });
  });
});

describe("MatchsService : doublons de matchs programmes", () => {
  let ds: DataSource;
  let svc: MatchsService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new MatchsService(ds.getRepository(Match), ds.getRepository(Composition), ds.getRepository(EvenementMatch));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  it("creer deux fois le meme match programme : la seconde creation est refusee (409), un seul match existe", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s = await f.saison("2026-2027", 2026, { actif: true });
    const eq = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s.id });
    await svc.create({ clubDom: moi.id, clubExt: adv.id, equipeDomId: eq.id, saisonId: s.id, date: "2026-10-18", heure: "15:00", statut: "prevu" } as UpsertMatchDto);

    await expect(svc.create({ clubDom: moi.id, clubExt: adv.id, equipeDomId: eq.id, saisonId: s.id, date: "2026-10-18", statut: "prevu" } as UpsertMatchDto))
      .rejects.toBeInstanceOf(ConflictException);

    expect(await ds.getRepository(Match).count()).toBe(1);
  });

  it("le doublon est reconnu meme si la date existante est au format JJ/MM/AAAA", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s = await f.saison("2026-2027", 2026, { actif: true });
    const eq = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s.id });
    await f.match({ clubDom: moi.id, clubExt: adv.id, equipeDomId: eq.id, saisonId: s.id, date: "18/10/2026", statut: "a_venir" });

    await expect(svc.create({ clubDom: moi.id, clubExt: adv.id, equipeDomId: eq.id, saisonId: s.id, date: "2026-10-18", statut: "prevu" } as UpsertMatchDto))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("reliquat sans equipe ni saison (ancienne creation, invisible au calendrier) : la creation le complete au lieu d'en ajouter un second", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s = await f.saison("2026-2027", 2026, { actif: true });
    const eq = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s.id });
    const reliquat = await f.match({ clubDom: moi.id, clubExt: adv.id, date: "2026-10-18", statut: "prevu" });

    const cree = await svc.create({
      clubDom: moi.id, clubExt: adv.id, equipeDomId: eq.id, saisonId: s.id, date: "2026-10-18", heure: "15:00", statut: "prevu",
    } as UpsertMatchDto);

    expect(cree.id).toBe(reliquat.id);
    expect(cree).toMatchObject({ equipeDomId: eq.id, saisonId: s.id, heure: "15:00" });
    expect(await ds.getRepository(Match).count()).toBe(1);
  });

  it("autre jour, autre sens ou match deja joue : la creation reste possible", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    await svc.create({ clubDom: moi.id, clubExt: adv.id, date: "2026-10-18", statut: "prevu" } as UpsertMatchDto);
    await f.match({ clubDom: moi.id, clubExt: adv.id, date: "2026-11-01", statut: "joue", scoreDom: 2, scoreExt: 1, numeroFmi: "123" });

    await svc.create({ clubDom: moi.id, clubExt: adv.id, date: "2026-10-25", statut: "prevu" } as UpsertMatchDto);   // autre jour
    await svc.create({ clubDom: adv.id, clubExt: moi.id, date: "2026-10-18", statut: "prevu" } as UpsertMatchDto);   // match retour
    await svc.create({ clubDom: moi.id, clubExt: adv.id, date: "2026-11-01", statut: "prevu" } as UpsertMatchDto);   // jour d'un match deja joue

    expect(await ds.getRepository(Match).count()).toBe(5);
  });

  it("creer puis modifier un match du calendrier : une seule instance, a la nouvelle date", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const cree = await svc.create({ clubDom: moi.id, clubExt: adv.id, date: "2026-10-18", heure: "15:00", statut: "prevu" } as UpsertMatchDto);

    await svc.update(cree.id, { date: "2026-10-19", heure: "16:00" } as UpdateMatchDto);

    const tous = await ds.getRepository(Match).find();
    expect(tous).toHaveLength(1);
    expect(tous[0]).toMatchObject({ id: cree.id, date: "2026-10-19", heure: "16:00" });
  });
});
