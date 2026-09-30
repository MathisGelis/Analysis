import { BadRequestException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Equipe, Joueur, Match, Tactique } from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { formationValide, TactiquesService } from "./tactiques.module";

describe("formationValide", () => {
  it.each(["4-4-2", "4-2-3-1", "3-5-2", "5-3-2", "4-1-4-1"])("%s est valide", (f) => expect(formationValide(f)).toBe(true));
  it.each(["4-4-3", "4-4", "abc", "", "4-4-2-1-1-1", "0-5-5", "7-2-1"])("%s est invalide", (f) => expect(formationValide(f)).toBe(false));
});

describe("TactiquesService", () => {
  let ds: DataSource;
  let svc: TactiquesService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    f = fabriques(ds);
    svc = new TactiquesService(ds.getRepository(Tactique), ds.getRepository(Equipe), ds.getRepository(Joueur), ds.getRepository(Match));
  });
  afterEach(() => ds.destroy());

  async function contexte(statuts: string[] = []) {
    const club = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const saison = await f.saison("2026-2027", 2026, { actif: true });
    const eq = await f.equipe({ clubId: club.id, nom: "Seniors", categorie: "Seniors", saisonId: saison.id });
    const advEq = await f.equipe({ clubId: adv.id, nom: "Adverse", categorie: "Seniors", saisonId: saison.id });
    const match = await f.match({ clubDom: club.id, clubExt: adv.id, equipeDomId: eq.id, equipeExtId: advEq.id, saisonId: saison.id, statut: "a_venir" });
    // 18 joueurs : statuts donnes d'abord, puis "Pas mutation".
    const joueurs: Joueur[] = [];
    for (let i = 0; i < 18; i++) {
      joueurs.push(await f.joueur({ nom: `J${i}`, prenom: "Jo", clubId: club.id, poste: i === 0 ? "GB" : "DC", statutMutation: statuts[i] ?? "Pas mutation" }));
    }
    return { eq, advEq, match, joueurs };
  }

  const dto = (c: Awaited<ReturnType<typeof contexte>>, extra: Record<string, any> = {}) => ({
    equipeId: c.eq.id,
    formation: "4-4-2",
    titulaires: c.joueurs.slice(0, 11).map((j) => j.id),
    remplacants: c.joueurs.slice(11, 18).map((j) => j.id),
    ...extra,
  });

  it("enregistre un plan complet puis le relit", async () => {
    const c = await contexte();
    const plan = await svc.enregistrer(dto(c, { capitaineId: c.joueurs[3].id, notes: "  Presser haut  " }));

    expect(plan).toMatchObject({ formation: "4-4-2", capitaineId: c.joueurs[3].id, notes: "Presser haut", matchId: null });
    const relu = await svc.lire(c.eq.id);
    expect(relu?.titulaires).toEqual(c.joueurs.slice(0, 11).map((j) => j.id));
    expect(relu?.remplacants).toHaveLength(7);
  });

  it("un seul plan par equipe : enregistrer a nouveau met a jour, sans doublon", async () => {
    const c = await contexte();
    await svc.enregistrer(dto(c));
    await svc.enregistrer(dto(c, { formation: "3-5-2" }));

    expect(await ds.getRepository(Tactique).count()).toBe(1);
    expect((await svc.lire(c.eq.id))?.formation).toBe("3-5-2");
  });

  it("un plan par match, distinct du plan courant", async () => {
    const c = await contexte();
    await svc.enregistrer(dto(c));
    await svc.enregistrer(dto(c, { matchId: c.match.id, formation: "5-3-2" }));

    expect(await ds.getRepository(Tactique).count()).toBe(2);
    expect((await svc.lire(c.eq.id))?.formation).toBe("4-4-2");
    expect((await svc.lire(c.eq.id, c.match.id))?.formation).toBe("5-3-2");
  });

  it("brouillon : des postes vides sont acceptes", async () => {
    const c = await contexte();
    const plan = await svc.enregistrer(dto(c, { titulaires: [c.joueurs[0].id, ...Array(10).fill(null)], remplacants: [] }));
    expect(plan.titulaires[0]).toBe(c.joueurs[0].id);
    expect(plan.titulaires.slice(1).every((x) => x === "")).toBe(true);
  });

  describe("regle des mutes", () => {
    it("6 mutes dont 2 hors delai : accepte, pile a la limite", async () => {
      const c = await contexte([...Array(4).fill("Mutation"), ...Array(2).fill("Mutation hors delai")]);
      await expect(svc.enregistrer(dto(c))).resolves.toBeDefined();
    });

    it("7 mutes sur la liste : refuse (422) avec le detail", async () => {
      const c = await contexte(Array(7).fill("Mutation"));
      const tentative = svc.enregistrer(dto(c));
      await expect(tentative).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(tentative).rejects.toMatchObject({
        response: { code: "REGLE_MUTATIONS", mutes: 7, horsDelai: 0, violations: ["7 joueurs mutes : le maximum est 6."] },
      });
      expect(await ds.getRepository(Tactique).count()).toBe(0);
    });

    it("3 mutes hors delai : refuse", async () => {
      const c = await contexte(Array(3).fill("Mutation hors delai"));
      await expect(svc.enregistrer(dto(c))).rejects.toMatchObject({
        response: { code: "REGLE_MUTATIONS", horsDelai: 3, violations: ["3 mutes hors delai : le maximum est 2."] },
      });
    });

    it("la regle porte sur les titulaires ET les remplacants", async () => {
      // 4 mutes chez les titulaires + 3 sur le banc = 7.
      const c = await contexte([...Array(4).fill("Mutation"), ...Array(7).fill("Pas mutation"), ...Array(3).fill("Mutation")]);
      await expect(svc.enregistrer(dto(c))).rejects.toBeInstanceOf(UnprocessableEntityException);
      // En ne gardant que 2 des 3 mutes du banc : 4 + 2 = 6, accepte.
      const banc = [11, 12, 14, 15, 16, 17].map((i) => c.joueurs[i].id);
      await expect(svc.enregistrer(dto(c, { remplacants: banc }))).resolves.toBeDefined();
    });

    it("statut inconnu : non compte, n'empeche pas l'enregistrement", async () => {
      const c = await contexte(Array(10).fill("Non connu"));
      await expect(svc.enregistrer(dto(c))).resolves.toBeDefined();
    });

    it("un plan refuse ne modifie pas le plan deja enregistre", async () => {
      const c = await contexte();
      await svc.enregistrer(dto(c));
      await ds.getRepository(Joueur).update(c.joueurs.slice(0, 8).map((j) => j.id), { statutMutation: "Mutation" });

      await expect(svc.enregistrer(dto(c, { formation: "3-5-2" }))).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect((await svc.lire(c.eq.id))?.formation).toBe("4-4-2");
    });
  });

  describe("donnees invalides", () => {
    it("equipe ou match inconnu : 404 ; match d'une autre equipe : 400", async () => {
      const c = await contexte();
      await expect(svc.enregistrer({ ...dto(c), equipeId: "inconnue" })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.enregistrer(dto(c, { matchId: "inconnu" }))).rejects.toBeInstanceOf(NotFoundException);
      const autre = await f.match({ clubDom: "x", clubExt: "y", equipeDomId: "e1", equipeExtId: "e2" });
      await expect(svc.enregistrer(dto(c, { matchId: autre.id }))).rejects.toBeInstanceOf(BadRequestException);
    });

    it("dispositif invalide, mauvais nombre de cases, trop de remplacants : 400", async () => {
      const c = await contexte();
      await expect(svc.enregistrer(dto(c, { formation: "4-4-3" }))).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.enregistrer(dto(c, { titulaires: c.joueurs.slice(0, 10).map((j) => j.id) }))).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.enregistrer(dto(c, { remplacants: [...c.joueurs.slice(11, 18).map((j) => j.id), "x"] }))).rejects.toBeInstanceOf(BadRequestException);
    });

    it("joueur en double, joueur inconnu, capitaine hors du onze : 400", async () => {
      const c = await contexte();
      const ids = c.joueurs.slice(0, 11).map((j) => j.id);
      await expect(svc.enregistrer(dto(c, { remplacants: [ids[0]] }))).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.enregistrer(dto(c, { titulaires: [...ids.slice(0, 10), "fantome"] }))).rejects.toMatchObject({
        message: expect.stringContaining("fantome"),
      });
      await expect(svc.enregistrer(dto(c, { capitaineId: c.joueurs[15].id }))).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it("supprimer : retire le plan, idempotent", async () => {
    const c = await contexte();
    await svc.enregistrer(dto(c));
    expect(await svc.supprimer(c.eq.id)).toEqual({ ok: true, supprime: true });
    expect(await svc.lire(c.eq.id)).toBeNull();
    expect(await svc.supprimer(c.eq.id)).toEqual({ ok: true, supprime: false });
  });
});
