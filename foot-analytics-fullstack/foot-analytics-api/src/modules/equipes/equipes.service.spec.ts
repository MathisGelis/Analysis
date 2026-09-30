import { DataSource } from "typeorm";
import { Entrainement, Equipe, Joueur, StatJoueurEquipe } from "@/entities";
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

  /* ------------------------------------------------------------------ */
  /*  Saison suivante : la poule change, l'equipe reste la meme           */
  /* ------------------------------------------------------------------ */
  describe("changement de poule d'une saison a l'autre", () => {
    const D2C = { categorie: "Seniors", division: "D2", poule: "C", competitionLibelle: "Seniors D2 / Phase Unique" };
    const D2A = { competitionLibelle: "Seniors D2 / Phase Unique", poule: "A" };

    /** Situation reelle : saison 25-26 en D2 poule C (jouee), 26-27 creee et clonee, sans FMI. */
    async function contexte() {
      const club = await f.club("OL Sud");
      const adv = await f.club("Adverse");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      const eq25 = await f.equipe({ clubId: club.id, nom: "Seniors D2 Poule C", ...D2C, saisonId: s25.id });
      const r2 = await f.equipe({ clubId: club.id, nom: "Seniors R2 Poule C", categorie: "Seniors", division: "R2", poule: "C", competitionLibelle: "Seniors Regional 2 / Unique", saisonId: s25.id });
      await svc.cloneSaison({ clubId: club.id, fromSaisonId: s25.id, toSaisonId: s26.id });
      const clones = await svc.findAll({ clubId: club.id, saisonId: s26.id });
      return { club, adv, s25, s26, eq25, r2, cloneD2: clones.find((e) => e.division === "D2")!, cloneR2: clones.find((e) => e.division === "R2")! };
    }
    const ratacher = (clubId: string, saisonId: string, equipeId: string, adv: string) =>
      f.match({ clubDom: clubId, clubExt: adv, equipeDomId: equipeId, saisonId });

    it("la 1re FMI de la nouvelle poule reprend le clone du meme niveau, sans toucher a l'autre equipe Seniors", async () => {
      const c = await contexte();

      const eq = await svc.upsertForFmi({ clubId: c.club.id, ...D2A, saisonId: c.s26.id });

      expect(eq.id).toBe(c.cloneD2.id);
      expect(eq).toMatchObject({ poule: "A", division: "D2", nom: "Seniors D2 Poule A" });
      const surS26 = await svc.findAll({ clubId: c.club.id, saisonId: c.s26.id });
      expect(surS26).toHaveLength(2);
      expect(surS26.find((e) => e.id === c.cloneR2.id)).toMatchObject({ poule: "C", division: "R2" });
    });

    it("le clone n'est pas recree apres coup quand la vraie equipe existe deja (autre poule)", async () => {
      const c = await contexte();
      await f.equipe({ clubId: c.club.id, nom: "Seniors D2 Poule A", categorie: "Seniors", division: "D2", ...D2A, saisonId: c.s26.id });
      await svc.remove(c.cloneD2.id);

      const r = await svc.cloneSaison({ clubId: c.club.id, fromSaisonId: c.s25.id, toSaisonId: c.s26.id });

      expect(r.creees).toBe(0);
      const d2 = (await svc.findAll({ clubId: c.club.id, saisonId: c.s26.id })).filter((e) => e.division === "D2");
      expect(d2.map((e) => e.poule)).toEqual(["A"]);
    });

    it("cree la vraie equipe puis absorbe les clones provisoires du meme niveau (joueurs et seances suivent)", async () => {
      const c = await contexte();
      // Deux clones D2 (double clonage historique) : ambigu pour la reprise -> creation, puis absorption.
      const doublon = await f.equipe({ clubId: c.club.id, nom: "Seniors D2 Poule B", categorie: "Seniors", division: "D2", poule: "B", competitionLibelle: "Seniors D2 / Phase Unique", saisonId: c.s26.id });
      const j1 = await f.joueur({ nom: "UN", clubId: c.club.id, equipesAttachees: [c.cloneD2.id] });
      const j2 = await f.joueur({ nom: "DEUX", clubId: c.club.id, equipesAttachees: [doublon.id, c.cloneD2.id] });
      await ds.getRepository(Entrainement).save({ equipeId: doublon.id, date: "2026-08-20" } as any);

      const eq = await svc.upsertForFmi({ clubId: c.club.id, ...D2A, saisonId: c.s26.id });

      const d2 = (await svc.findAll({ clubId: c.club.id, saisonId: c.s26.id })).filter((e) => e.division === "D2");
      expect(d2.map((e) => e.id)).toEqual([eq.id]);
      const repoJ = ds.getRepository(Joueur);
      expect((await repoJ.findOneByOrFail({ id: j1.id })).equipesAttachees).toEqual([eq.id]);
      expect((await repoJ.findOneByOrFail({ id: j2.id })).equipesAttachees).toEqual([eq.id]);
      expect(await ds.getRepository(Entrainement).count({ where: { equipeId: eq.id } })).toBe(1);
    });

    it("les buts / passes saisis suivent l'equipe absorbee ; la saisie de la cible fait foi", async () => {
      const c = await contexte();
      const j1 = await f.joueur({ nom: "UN", clubId: c.club.id });
      const j2 = await f.joueur({ nom: "DEUX", clubId: c.club.id });
      const repoS = ds.getRepository(StatJoueurEquipe);
      const source = await f.equipe({ clubId: c.club.id, nom: "Provisoire", categorie: "U20", division: "D1", saisonId: c.s26.id });
      const cible = await f.equipe({ clubId: c.club.id, nom: "Reelle", categorie: "U20", division: "D1", poule: "B", saisonId: c.s26.id });
      await repoS.save([
        { joueurId: j1.id, equipeId: source.id, buts: 4, passesDecisives: null },
        { joueurId: j2.id, equipeId: source.id, buts: 9, passesDecisives: null },
        { joueurId: j2.id, equipeId: cible.id, buts: 2, passesDecisives: null },
      ]);

      await svc.fusionner(source.id, cible.id);

      const lignes = await repoS.find();
      expect(lignes.map((l) => [l.joueurId, l.equipeId, l.buts]).sort()).toEqual(
        [[j1.id, cible.id, 4], [j2.id, cible.id, 2]].sort(),
      );
    });

    it("n'absorbe jamais une equipe deja jouee", async () => {
      const c = await contexte();
      await ratacher(c.club.id, c.s26.id, c.cloneD2.id, c.adv.id);

      const eq = await svc.upsertForFmi({ clubId: c.club.id, ...D2A, saisonId: c.s26.id });

      // Le clone a des matchs : ce n'est plus un clone provisoire, il reste.
      expect(eq.id).not.toBe(c.cloneD2.id);
      expect((await svc.findAll({ clubId: c.club.id, saisonId: c.s26.id })).filter((e) => e.division === "D2")).toHaveLength(2);
    });
  });

  describe("reconcilier (donnees existantes)", () => {
    async function scenario() {
      const club = await f.club("OL Sud");
      const adv = await f.club("Adverse");
      const s26 = await f.saison("2026-2027", 2026);
      const reelle = await f.equipe({ clubId: club.id, nom: "Seniors D2 Poule A", categorie: "Seniors", division: "D2", poule: "A", competitionLibelle: "Seniors D2 / Phase Unique", saisonId: s26.id });
      const clone = await f.equipe({ clubId: club.id, nom: "Seniors D2 Poule C", categorie: "Seniors", division: "D2", poule: "C", competitionLibelle: "Seniors D2 / Phase Unique", saisonId: s26.id });
      const r2 = await f.equipe({ clubId: club.id, nom: "Seniors R2 Poule C", categorie: "Seniors", division: "R2", poule: "C", saisonId: s26.id });
      await f.match({ clubDom: club.id, clubExt: adv.id, equipeDomId: reelle.id, saisonId: s26.id });
      const joueur = await f.joueur({ nom: "ATTACHE", clubId: club.id, equipesAttachees: [clone.id] });
      await ds.getRepository(Entrainement).save({ equipeId: clone.id, date: "2026-08-20" } as any);
      return { club, s26, reelle, clone, r2, joueur };
    }

    it("simulation : decrit la fusion sans rien modifier", async () => {
      const x = await scenario();

      const r = await svc.reconcilier(false);

      expect(r.appliquer).toBe(false);
      expect(r.fusions).toEqual([{
        club: "OL Sud", saison: "2026-2027",
        source: { id: x.clone.id, nom: "Seniors D2 Poule C", poule: "C" },
        cible: { id: x.reelle.id, nom: "Seniors D2 Poule A", poule: "A" },
        joueursDeplaces: 1, seancesDeplacees: 1,
      }]);
      expect(await svc.findAll({ clubId: x.club.id })).toHaveLength(3);
    });

    it("application : fusionne le clone dans la vraie equipe, epargne l'autre niveau", async () => {
      const x = await scenario();

      await svc.reconcilier(true);

      const restantes = (await svc.findAll({ clubId: x.club.id })).map((e) => e.id).sort();
      expect(restantes).toEqual([x.reelle.id, x.r2.id].sort());
      const j = await ds.getRepository(Joueur).findOneByOrFail({ id: x.joueur.id });
      expect(j.equipesAttachees).toEqual([x.reelle.id]);
      expect(await ds.getRepository(Entrainement).count({ where: { equipeId: x.reelle.id } })).toBe(1);
    });

    it("idempotent, et limitable a une saison", async () => {
      const x = await scenario();
      expect((await svc.reconcilier(true, "autre-saison")).fusions).toHaveLength(0);
      expect((await svc.reconcilier(true, x.s26.id)).fusions).toHaveLength(1);
      expect((await svc.reconcilier(true)).fusions).toHaveLength(0);
    });

    it("plusieurs equipes deja jouees au meme niveau : signale comme ambigu, jamais fusionne", async () => {
      const x = await scenario();
      const adv = await f.club("Autre");
      await f.match({ clubDom: x.club.id, clubExt: adv.id, equipeDomId: x.clone.id, saisonId: x.s26.id });

      const r = await svc.reconcilier(true);

      expect(r.fusions).toHaveLength(0);
      expect(r.ambigus).toEqual([{ club: "OL Sud", saison: "2026-2027", niveau: "Seniors D2", equipes: expect.arrayContaining(["Seniors D2 Poule A", "Seniors D2 Poule C"]) }]);
      expect(await svc.findAll({ clubId: x.club.id })).toHaveLength(3);
    });
  });
});
