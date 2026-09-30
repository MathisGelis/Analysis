import { DataSource } from "typeorm";
import { Equipe } from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { EquipesService } from "./equipes.module";

describe("EquipesService", () => {
  let ds: DataSource;
  let svc: EquipesService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new EquipesService(ds.getRepository(Equipe));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  describe("cloneSaison", () => {
    it("copie les meta-equipes vers la nouvelle saison, sans joueurs", async () => {
      const club = await f.club("OL Sud");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({
        clubId: club.id, nom: "Seniors D2 Poule C", categorie: "Seniors", division: "D2",
        poule: "C", competitionLibelle: "Seniors D2 / Phase Unique", saisonId: s25.id,
      });
      const joueur = await f.joueur({ nom: "DUPONT", clubId: club.id });

      const r = await svc.cloneSaison({ clubId: club.id, fromSaisonId: s25.id, toSaisonId: s26.id });

      expect(r).toEqual({ creees: 1, existaient: 0 });
      const clone = (await svc.findAll({ clubId: club.id, saisonId: s26.id }))[0];
      expect(clone).toMatchObject({
        nom: "Seniors D2 Poule C", categorie: "Seniors", division: "D2", poule: "C",
        competitionLibelle: "Seniors D2 / Phase Unique", saisonId: s26.id,
      });
      const j = await ds.getRepository("Joueur").findOneByOrFail({ id: joueur.id });
      expect((j as any).equipesAttachees ?? []).toEqual([]);
    });

    it("est idempotent : un second appel ne cree rien", async () => {
      const club = await f.club("OL Sud");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: club.id, nom: "U20", categorie: "U20", poule: "B", competitionLibelle: "U20 R2", saisonId: s25.id });

      await svc.cloneSaison({ clubId: club.id, fromSaisonId: s25.id, toSaisonId: s26.id });
      const r2 = await svc.cloneSaison({ clubId: club.id, fromSaisonId: s25.id, toSaisonId: s26.id });

      expect(r2).toEqual({ creees: 0, existaient: 1 });
      expect(await svc.findAll({ saisonId: s26.id })).toHaveLength(1);
    });

    it("ne touche pas aux autres clubs", async () => {
      const a = await f.club("A");
      const b = await f.club("B");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: a.id, nom: "A1", categorie: "Seniors", saisonId: s25.id });
      await f.equipe({ clubId: b.id, nom: "B1", categorie: "Seniors", saisonId: s25.id });

      await svc.cloneSaison({ clubId: a.id, fromSaisonId: s25.id, toSaisonId: s26.id });

      const surS26 = await svc.findAll({ saisonId: s26.id });
      expect(surS26.map((e) => e.clubId)).toEqual([a.id]);
    });
  });

  describe("cloneSaisonForAllClubs", () => {
    it("clone tous les clubs ayant des equipes sur la saison source", async () => {
      const a = await f.club("A");
      const b = await f.club("B");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: a.id, nom: "A1", categorie: "Seniors", saisonId: s25.id });
      await f.equipe({ clubId: b.id, nom: "B1", categorie: "Seniors", saisonId: s25.id });
      await f.equipe({ clubId: b.id, nom: "B2", categorie: "U18", saisonId: s25.id });

      const r = await svc.cloneSaisonForAllClubs({ fromSaisonId: s25.id, toSaisonId: s26.id });

      expect(r).toEqual({ clubs: 2, creees: 3, existaient: 0 });
    });
  });

  describe("upsertForFmi", () => {
    const base = { competitionLibelle: "Seniors D2 / Phase Unique", poule: "C" };

    it("etape 1 : retrouve l'equipe exacte (competition + poule + saison)", async () => {
      const club = await f.club("OL Sud");
      const s = await f.saison("2025-2026", 2025);
      const existante = await f.equipe({
        clubId: club.id, nom: "Seniors D2 Poule C", categorie: "Seniors", ...base, saisonId: s.id,
      });

      const eq = await svc.upsertForFmi({ clubId: club.id, ...base, saisonId: s.id });

      expect(eq.id).toBe(existante.id);
      expect(await svc.findAll({ clubId: club.id })).toHaveLength(1);
    });

    it("etape 3 : cree l'equipe et deduit categorie / division du libelle", async () => {
      const club = await f.club("OL Sud");
      const s = await f.saison("2025-2026", 2025);

      const eq = await svc.upsertForFmi({
        clubId: club.id, competitionLibelle: "U20 Regional 2 / Unique", poule: "B", saisonId: s.id,
      });

      expect(eq).toMatchObject({
        nom: "U20 R2 Poule B", categorie: "U20", division: "R2", poule: "B", saisonId: s.id,
      });
    });

    it("etape 2 : une equipe clonee orpheline de meme categorie est mise a jour (montee D2 -> D1)", async () => {
      const club = await f.club("OL Sud");
      const s26 = await f.saison("2026-2027", 2026);
      const clonee = await f.equipe({
        clubId: club.id, nom: "Seniors D2 Poule C", categorie: "Seniors", division: "D2",
        poule: "C", competitionLibelle: "Seniors D2 / Phase Unique", saisonId: s26.id,
      });

      const eq = await svc.upsertForFmi({
        clubId: club.id, competitionLibelle: "Seniors D1 / Phase Unique", poule: "A", saisonId: s26.id,
      });

      expect(eq.id).toBe(clonee.id);
      expect(eq).toMatchObject({ division: "D1", poule: "A", competitionLibelle: "Seniors D1 / Phase Unique" });
      expect(await svc.findAll({ clubId: club.id })).toHaveLength(1);
    });

    it("etape 2 : plusieurs orphelines de meme categorie -> pas de choix arbitraire, nouvelle equipe", async () => {
      const club = await f.club("OL Sud");
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: club.id, nom: "Seniors 1", categorie: "Seniors", competitionLibelle: "Seniors D2 / Phase Unique", poule: "C", saisonId: s26.id });
      await f.equipe({ clubId: club.id, nom: "Seniors 2", categorie: "Seniors", competitionLibelle: "Seniors D4 / Phase Unique", poule: "A", saisonId: s26.id });

      await svc.upsertForFmi({
        clubId: club.id, competitionLibelle: "Seniors D1 / Phase Unique", poule: "A", saisonId: s26.id,
      });

      expect(await svc.findAll({ clubId: club.id })).toHaveLength(3);
    });

    it("etape 2 : une equipe qui a deja des matchs n'est pas orpheline", async () => {
      const club = await f.club("OL Sud");
      const adv = await f.club("Adverse");
      const s26 = await f.saison("2026-2027", 2026);
      const active = await f.equipe({
        clubId: club.id, nom: "Seniors D2 Poule C", categorie: "Seniors",
        competitionLibelle: "Seniors D2 / Phase Unique", poule: "C", saisonId: s26.id,
      });
      await f.match({ clubDom: club.id, clubExt: adv.id, equipeDomId: active.id, saisonId: s26.id });

      const eq = await svc.upsertForFmi({
        clubId: club.id, competitionLibelle: "Seniors D1 / Phase Unique", poule: "A", saisonId: s26.id,
      });

      expect(eq.id).not.toBe(active.id);
      expect(await svc.findAll({ clubId: club.id })).toHaveLength(2);
    });

    it("l'orpheline d'une AUTRE saison n'est jamais reutilisee", async () => {
      const club = await f.club("OL Sud");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      const ancienne = await f.equipe({ clubId: club.id, nom: "Seniors D2 Poule C", categorie: "Seniors", competitionLibelle: "Seniors D2 / Phase Unique", poule: "C", saisonId: s25.id });

      const eq = await svc.upsertForFmi({ clubId: club.id, competitionLibelle: "Seniors D1 / Phase Unique", poule: "A", saisonId: s26.id });

      expect(eq.id).not.toBe(ancienne.id);
      expect(eq.saisonId).toBe(s26.id);
    });
  });
});
