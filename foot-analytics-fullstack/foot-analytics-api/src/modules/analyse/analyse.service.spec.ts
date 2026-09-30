import { DataSource } from "typeorm";
import {
  Club, Coach, Composition, Entrainement, Equipe, EvenementMatch, Joueur, LigneClassement, Match, Saison, StaffMatch,
} from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { AnalyseService } from "./analyse.module";

describe("AnalyseService.rapportClub", () => {
  let ds: DataSource;
  let svc: AnalyseService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new AnalyseService(
      ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Joueur),
      ds.getRepository(Composition), ds.getRepository(EvenementMatch), ds.getRepository(Entrainement),
      ds.getRepository(Coach), ds.getRepository(StaffMatch), ds.getRepository(Equipe),
      ds.getRepository(LigneClassement), ds.getRepository(Saison),
    );
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  /** Mon club : Seniors (2 matchs en 25-26, 1 en 26-27) + U20 (1 match en 25-26). */
  async function contexte() {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s25 = await f.saison("2025-2026", 2025);
    const s26 = await f.saison("2026-2027", 2026);
    const seniors25 = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s25.id });
    const u20 = await f.equipe({ clubId: moi.id, nom: "U20", categorie: "U20", saisonId: s25.id });
    const seniors26 = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s26.id });
    const advEq = await f.equipe({ clubId: adv.id, nom: "Adverse", categorie: "Seniors", saisonId: s25.id });
    await f.joueur({ nom: "SENIOR", prenom: "Ali", clubId: moi.id });
    await f.joueur({ nom: "JUNIOR", prenom: "Bob", clubId: moi.id });
    const jouer = async (eq: { id: string }, saisonId: string, nom: string, prenom: string, sd = 2, se = 0) => {
      const m = await f.match({ clubDom: moi.id, clubExt: adv.id, equipeDomId: eq.id, equipeExtId: advEq.id, saisonId, scoreDom: sd, scoreExt: se });
      await f.compo({ matchId: m.id, cote: "dom", nom, prenom });
      return m;
    };
    await jouer(seniors25, s25.id, "SENIOR", "Ali");
    await jouer(seniors25, s25.id, "SENIOR", "Ali");
    await jouer(u20, s25.id, "JUNIOR", "Bob");
    await jouer(seniors26, s26.id, "SENIOR", "Ali");
    return { moi, s25, s26, seniors25, u20, seniors26 };
  }

  it("sans perimetre : tous les matchs du club (comportement historique)", async () => {
    const c = await contexte();
    expect((await svc.rapportClub(c.moi.id)).matchsAnalyses).toBe(4);
  });

  it("par equipe : seuls les matchs de cette equipe, donc de sa saison", async () => {
    const c = await contexte();
    expect((await svc.rapportClub(c.moi.id, { equipeId: c.seniors25.id })).matchsAnalyses).toBe(2);
    expect((await svc.rapportClub(c.moi.id, { equipeId: c.u20.id })).matchsAnalyses).toBe(1);
    expect((await svc.rapportClub(c.moi.id, { equipeId: c.seniors26.id })).matchsAnalyses).toBe(1);
  });

  it("par saison : toutes les equipes du club sur cette saison", async () => {
    const c = await contexte();
    expect((await svc.rapportClub(c.moi.id, { saisonId: c.s25.id })).matchsAnalyses).toBe(3);
    expect((await svc.rapportClub(c.moi.id, { saisonId: c.s26.id })).matchsAnalyses).toBe(1);
  });

  it("les joueurs absents du perimetre ne figurent pas dans le tableau d'impact", async () => {
    const c = await contexte();
    const r = await svc.rapportClub(c.moi.id, { equipeId: c.seniors25.id });
    expect(r.impacts.map((i) => i.nom)).toEqual(["SENIOR"]);
  });

  it("equipe sans match : rapport vide, sans planter", async () => {
    const c = await contexte();
    const vide = await f.equipe({ clubId: c.moi.id, nom: "Seniors 2", categorie: "Seniors", saisonId: c.s26.id });
    const r = await svc.rapportClub(c.moi.id, { equipeId: vide.id });
    expect(r.matchsAnalyses).toBe(0);
    expect(r.impacts).toEqual([]);
  });

  it("club inconnu : 404", async () => {
    await expect(svc.rapportClub("inconnu")).rejects.toThrow(/introuvable/);
  });

  describe("tendances", () => {
    /** 10 matchs de ma poule : 5 defaites puis 5 victoires ; dates jj/mm/aaaa a cheval sur deux annees. */
    async function saisonEnDeuxTemps(actif: boolean, suffixe = "") {
      const moi = await f.club(`OL Sud${suffixe}`);
      const saison = await f.saison(suffixe ? "2024-2025" : "2025-2026", suffixe ? 2024 : 2025, { actif });
      const poule = { categorie: "Seniors", division: "D2", competitionLibelle: "Seniors D2", poule: "C", saisonId: saison.id };
      const eq = await f.equipe({ clubId: moi.id, nom: "Seniors D2 Poule C", ...poule });
      const advs: { club: Club; equipe: Equipe }[] = [];
      for (let i = 0; i < 12; i++) {
        const club = await f.club(`Adv ${i + 1}${suffixe}`);
        const equipe = await f.equipe({ clubId: club.id, nom: `Adv ${i + 1}`, ...poule });
        advs.push({ club, equipe });
        await ds.getRepository(LigneClassement).save({ clubId: club.id, equipeId: equipe.id, saisonId: saison.id, rang: i + 1, joues: 10, v: 0, n: 0, d: 0, bp: 0, bc: 0, pts: 30 - i } as any);
      }
      // Ordre d'insertion volontairement melange : la chronologie doit venir des dates.
      const dates = ["27/09/2025", "04/10/2025", "18/10/2025", "15/11/2025", "06/12/2025", "10/01/2026", "24/01/2026", "07/02/2026", "21/02/2026", "15/03/2026"];
      const scores: [number, number][] = [[0, 1], [0, 2], [0, 1], [1, 2], [0, 1], [3, 0], [2, 0], [3, 0], [2, 1], [3, 0]];
      const ordre = [9, 0, 5, 3, 7, 1, 8, 2, 6, 4];
      const matchs: Match[] = [];
      for (const i of ordre) {
        // Les 5 premiers contre le haut du classement, les 5 derniers contre le bas.
        const adv = advs[i < 5 ? i : 11 - (i - 5)];
        matchs.push(await f.match({
          clubDom: moi.id, clubExt: adv.club.id, equipeDomId: eq.id, equipeExtId: adv.equipe.id, saisonId: saison.id,
          date: dates[i], journee: String(i + 1), scoreDom: scores[i][0], scoreExt: scores[i][1], statut: "joue",
        }));
      }
      return { moi, saison, eq, advs, matchs };
    }

    it("dynamique en hausse detectee sur des dates jj/mm/aaaa desordonnees", async () => {
      const c = await saisonEnDeuxTemps(true);
      const r = await svc.rapportClub(c.moi.id, { equipeId: c.eq.id });
      const t = r.tendances;
      expect(t.matchs).toBe(10);
      expect(t.courbe.map((p) => p.issue).join("")).toBe("DDDDDVVVVV");
      expect(t.forme).toMatchObject({ sens: "hausse", fenetre: 5 });
      expect(t.forme.recente.pts).toBe(15);
      expect(t.insights.map((i) => i.id)).toEqual(expect.arrayContaining(["forme-hausse", "serie-victoires"]));
    });

    it("perimetre : equipe, saison, poule ; forme des joueurs seulement sur la saison active", async () => {
      const actif = await saisonEnDeuxTemps(true);
      const r1 = await svc.rapportClub(actif.moi.id, { equipeId: actif.eq.id });
      expect(r1.perimetre).toMatchObject({ equipeNom: "Seniors D2 Poule C", saisonNom: "2025-2026", saisonActive: true, poule: "C" });
      expect(typeof r1.formeMoy).toBe("number");

      const archive = await saisonEnDeuxTemps(false, " archive");
      const r2 = await svc.rapportClub(archive.moi.id, { equipeId: archive.eq.id });
      expect(r2.perimetre.saisonActive).toBe(false);
      expect(r2.formeMoy).toBeNull();
    });

    it("niveau des adversaires : rang au classement de la poule", async () => {
      const c = await saisonEnDeuxTemps(true);
      const t = (await svc.rapportClub(c.moi.id, { equipeId: c.eq.id })).tendances;
      // 12 equipes classees : tiers de 4. 5 matchs contre les rangs 1-5 (haut : 4, milieu : 1), 5 contre 12-8 (bas : 4, milieu : 1).
      expect(t.parNiveau).not.toBeNull();
      const haut = t.parNiveau!.find((n) => n.niveau === "haut")!;
      const bas = t.parNiveau!.find((n) => n.niveau === "bas")!;
      expect(haut.bilan).toMatchObject({ joues: 4, pts: 0 });
      expect(bas.bilan).toMatchObject({ joues: 4, pts: 12 });
      expect(t.insights.map((i) => i.id)).toContain("niveau-haut-faible");
    });

    it("cartons et minutes lus dans les evenements du club, pas de l'adversaire", async () => {
      const c = await saisonEnDeuxTemps(true);
      const m = c.matchs[0];
      await f.evenement({ matchId: m.id, type: "carton", sousType: "jaune", equipe: "dom", joueur: "AMI Paul", minute: 80 });
      await f.evenement({ matchId: m.id, type: "carton", sousType: "rouge", equipe: "dom", joueur: "AMI Bob", minute: 85 });
      await f.evenement({ matchId: m.id, type: "carton", sousType: "jaune", equipe: "ext", joueur: "ADV Zed", minute: 10 });
      const t = (await svc.rapportClub(c.moi.id, { equipeId: c.eq.id })).tendances;
      expect(t.discipline).toMatchObject({ jaunes: 1, rouges: 1, cartonsAvecMinute: 2 });
      expect(t.discipline.parTranche[5]).toBe(2);
    });
  });

  describe("dynamiquePoule", () => {
    it("une ligne par equipe de la poule : classement, forme recente, sens, serie", async () => {
      const moi = await f.club("OL Sud");
      const saison = await f.saison("2025-2026", 2025, { actif: true });
      const poule = { categorie: "Seniors", division: "D2", competitionLibelle: "Seniors D2", poule: "C", saisonId: saison.id };
      const a = await f.equipe({ clubId: moi.id, nom: "OL Sud", ...poule });
      const clubB = await f.club("Bravo");
      const b = await f.equipe({ clubId: clubB.id, nom: "Bravo", ...poule });
      const autrePoule = await f.equipe({ clubId: clubB.id, nom: "Bravo B", ...poule, poule: "A" });
      await ds.getRepository(LigneClassement).save([
        { clubId: moi.id, equipeId: a.id, saisonId: saison.id, rang: 2, joues: 8, v: 4, n: 0, d: 4, bp: 9, bc: 8, pts: 12 },
        { clubId: clubB.id, equipeId: b.id, saisonId: saison.id, rang: 1, joues: 8, v: 6, n: 0, d: 2, bp: 12, bc: 5, pts: 18 },
      ] as any);
      // A : 4 victoires puis 4 defaites (en baisse) ; B : l'inverse ne se joue pas, il gagne toujours.
      const scoresA = [[1, 0], [1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [0, 1], [0, 1]];
      for (let i = 0; i < 8; i++) {
        await f.match({ clubDom: moi.id, clubExt: clubB.id, equipeDomId: a.id, equipeExtId: b.id, saisonId: saison.id,
          date: `0${i + 1}/10/2025`, journee: String(i + 1), scoreDom: scoresA[i][0], scoreExt: scoresA[i][1], statut: "joue" });
      }

      const r = await svc.dynamiquePoule(a.id);

      expect(r.equipes.map((e) => e.nom)).toEqual(["Bravo", "OL Sud"]);          // par rang
      expect(r.equipes.find((e) => e.equipeId === autrePoule.id)).toBeUndefined();  // autre poule exclue
      const ol = r.equipes.find((e) => e.nom === "OL Sud")!;
      expect(ol).toMatchObject({ rang: 2, joues: 8, sens: "baisse" });
      expect(ol.formeRecente).toEqual(["V", "D", "D", "D", "D"]);
      expect(ol.serie).toEqual({ type: "defaites", longueur: 4 });
      expect(r.equipes.find((e) => e.nom === "Bravo")).toMatchObject({ sens: "hausse" });
    });

    it("equipe inconnue : 404", async () => {
      await expect(svc.dynamiquePoule("inconnue")).rejects.toThrow(/introuvable/);
    });
  });
});
