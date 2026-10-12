import { BadRequestException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Composition } from "@/features/matchs/composition.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Match } from "@/features/matchs/match.entity";
import { Tactique } from "@/features/tactiques/tactique.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { formationValide } from "@/features/matchs/systeme";
import { TactiquesService } from "@/features/tactiques/tactiques.service";

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
    svc = new TactiquesService(ds.getRepository(Tactique), ds.getRepository(Equipe), ds.getRepository(Joueur), ds.getRepository(Match), ds.getRepository(Composition), ds.getRepository(EvenementMatch));
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

  describe("comparer : plan contre realise", () => {
    /** Plan enregistre puis date (la colonne de mise a jour est automatique). */
    async function preparer(c: Awaited<ReturnType<typeof contexte>>, matchId: string | null, modifieLe: string) {
      const plan = await svc.enregistrer(dto(c, { matchId, capitaineId: c.joueurs[5].id }));
      await ds.getRepository(Tactique).createQueryBuilder().update().set({ modifieLe: new Date(modifieLe) }).where("id = :id", { id: plan.id }).execute();
      return plan;
    }
    /** Feuille de mon cote : les 11 premiers titulaires, les 7 autres sur le banc (`sauf` : absents de la feuille). */
    async function jouerMatch(c: Awaited<ReturnType<typeof contexte>>, extra: Record<string, any> = {}, sauf: number[] = []) {
      const match = await ds.getRepository(Match).save({
        ...(await ds.getRepository(Match).findOneByOrFail({ id: c.match.id })), date: "25/01/2026", statut: "joue", scoreDom: 2, scoreExt: 1, ...extra,
      });
      await ds.getRepository(Composition).delete({ matchId: match.id });
      for (const [i, j] of c.joueurs.entries()) {
        if (sauf.includes(i)) continue;
        await f.compo({ matchId: match.id, cote: "dom", nom: j.nom, prenom: j.prenom, numero: i + 1, titulaire: i < 11, capitaine: i === 5, minutes: i < 11 ? 90 : 0 });
      }
      return match;
    }

    it("plan rattache au match : compare a la feuille, cote et score vus de mon equipe", async () => {
      const c = await contexte();
      const match = await jouerMatch(c);
      await preparer(c, match.id, "2026-01-20");

      const r = await svc.comparer(c.eq.id, match.id);

      expect(r.etat).toBe("ok");
      expect(r.match).toMatchObject({ id: match.id, domicile: true, buts: 2, butsAdversaire: 1 });
      expect(r.plan).toMatchObject({ source: "match", modifieApresMatch: false, formation: "4-4-2" });
      expect(r.comparaison).toMatchObject({ etat: "ok", adequation: 100, titulairesConformes: 11 });
      expect(r.comparaison!.capitaine.identique).toBe(true);
    });

    it("minutes a 0 apres un import FMI : le remplacant entre est reconnu par l'evenement, minutes deduites", async () => {
      const c = await contexte();
      const match = await jouerMatch(c);
      // Comme apres un import FMI : aucune minute stockee.
      await ds.getRepository(Composition).update({ matchId: match.id }, { minutes: 0 });
      // j3 (prevu titulaire) sort a la 60e pour j13 (prevu remplacant) ; j14 entre a la 90e.
      const nomDe = (i: number) => `${c.joueurs[i].nom} ${c.joueurs[i].prenom}`;
      await f.evenement({ matchId: match.id, type: "remplacement", equipe: "dom", joueur: nomDe(2), joueur2: nomDe(12), minute: 60 });
      await f.evenement({ matchId: match.id, type: "remplacement", equipe: "dom", joueur: nomDe(3), joueur2: nomDe(13), minute: 90 });
      await preparer(c, match.id, "2026-01-20");

      const r = await svc.comparer(c.eq.id, match.id);

      const ligne = (i: number) => r.comparaison!.lignes.find((l) => l.joueurId === c.joueurs[i].id)!;
      expect(ligne(12)).toMatchObject({ reel: "entre", minutes: 30, ecart: "conforme" });
      expect(ligne(13)).toMatchObject({ reel: "entre", minutes: 0, ecart: "conforme" });
      expect(ligne(2)).toMatchObject({ reel: "titulaire", minutes: 60 });
      expect(ligne(14)).toMatchObject({ reel: "banc" });
    });

    it("un titulaire prevu absent de la feuille est releve", async () => {
      const c = await contexte();
      const match = await jouerMatch(c, {}, [2]);
      await preparer(c, match.id, "2026-01-20");

      const r = await svc.comparer(c.eq.id, match.id);

      expect(r.comparaison!.adequation).toBe(91);
      expect(r.comparaison!.lignes.find((l) => l.joueurId === c.joueurs[2].id)).toMatchObject({ reel: "absent", ecart: "absent" });
    });

    it("vu du cote exterieur : la feuille de l'autre equipe est ignoree", async () => {
      const c = await contexte();
      const match = await jouerMatch(c, { clubDom: c.match.clubExt, clubExt: c.match.clubDom, equipeDomId: c.advEq.id, equipeExtId: c.eq.id, scoreDom: 0, scoreExt: 3 });
      await ds.getRepository(Composition).update({ matchId: match.id }, { cote: "ext" });
      await f.compo({ matchId: match.id, cote: "dom", nom: "AUTRE", prenom: "Equipe" });
      await preparer(c, match.id, "2026-01-20");

      const r = await svc.comparer(c.eq.id, match.id);

      expect(r.match).toMatchObject({ domicile: false, buts: 3, butsAdversaire: 0 });
      expect(r.comparaison!.adequation).toBe(100);
      expect(r.comparaison!.lignes.some((l) => l.nom.includes("AUTRE"))).toBe(false);
    });

    it("sans plan rattache : le plan courant sert s'il date d'avant le match, jamais s'il est posterieur", async () => {
      const c = await contexte();
      const match = await jouerMatch(c);
      const courant = await preparer(c, null, "2026-01-10");

      expect((await svc.comparer(c.eq.id, match.id)).plan).toMatchObject({ source: "courant" });

      await ds.getRepository(Tactique).createQueryBuilder().update().set({ modifieLe: new Date("2026-03-01") }).where("id = :id", { id: courant.id }).execute();
      expect((await svc.comparer(c.eq.id, match.id)).etat).toBe("pas_de_plan");
    });

    it("plan rattache mais modifie apres la rencontre : compare, avec l'avertissement", async () => {
      const c = await contexte();
      const match = await jouerMatch(c);
      await preparer(c, match.id, "2026-02-15");

      const r = await svc.comparer(c.eq.id, match.id);

      expect(r.etat).toBe("ok");
      expect(r.plan!.modifieApresMatch).toBe(true);
    });

    it("match non joue, feuille vide et match d'une autre equipe", async () => {
      const c = await contexte();
      await preparer(c, c.match.id, "2026-01-20");
      expect((await svc.comparer(c.eq.id, c.match.id)).etat).toBe("match_non_joue");

      const match = await jouerMatch(c, {}, Array.from({ length: 18 }, (_, i) => i));
      expect((await svc.comparer(c.eq.id, match.id)).etat).toBe("feuille_vide");

      await expect(svc.comparer(c.advEq.id, match.id).then((r) => r.match!.domicile)).resolves.toBe(false); // l'adversaire y joue aussi
      const tiers = await f.club("Tiers");
      const tiersEq = await f.equipe({ clubId: tiers.id, nom: "Tiers", categorie: "Seniors", saisonId: c.eq.saisonId });
      await expect(svc.comparer(tiersEq.id, match.id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.comparer("inconnue", match.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("sans matchId : le dernier match joue qui avait un plan ; aucun sinon", async () => {
      const c = await contexte();
      expect((await svc.comparer(c.eq.id)).etat).toBe("aucun_match_prepare");

      const ancien = await jouerMatch(c);
      await preparer(c, ancien.id, "2026-01-20");
      // Un match programme avec son plan ne compte pas : il n'est pas joue.
      const futur = await f.match({ clubDom: c.match.clubDom, clubExt: c.match.clubExt, equipeDomId: c.eq.id, equipeExtId: c.advEq.id, date: "25/03/2099", statut: "prevu" });
      await ds.getRepository(Tactique).save(ds.getRepository(Tactique).create({
        equipeId: c.eq.id, matchId: futur.id, formation: "4-4-2", titulaires: [], remplacants: [],
      }));

      const r = await svc.comparer(c.eq.id);

      expect(r.etat).toBe("ok");
      expect(r.match!.id).toBe(ancien.id);
    });
  });
});
