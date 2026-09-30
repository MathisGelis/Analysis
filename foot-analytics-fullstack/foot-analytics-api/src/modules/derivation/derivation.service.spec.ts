import { DataSource } from "typeorm";
import {
  Arbitre, ArbitreMatch, Blessure, Club, Coach, Composition, Entrainement, Equipe, EvenementMatch,
  Joueur, LigneClassement, Match, Saison, StaffMatch,
} from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { DerivationService } from "./derivation.module";

describe("DerivationService - cartons et arbitres", () => {
  let ds: DataSource;
  let svc: DerivationService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    f = fabriques(ds);
    const r = <T extends object>(e: new () => T) => ds.getRepository(e);
    svc = new DerivationService(
      r(Joueur), r(Match), r(LigneClassement), r(Club), r(Entrainement), r(Blessure),
      r(Arbitre), r(ArbitreMatch), r(Coach), r(StaffMatch), r(Equipe), r(Saison), r(EvenementMatch),
    );
  });
  afterEach(() => ds.destroy());

  async function matchArbitre(arbitre: Arbitre, cartons: { motif?: string; sousType?: string; type?: string }[]) {
    const dom = await f.club(`Dom ${Math.random()}`);
    const ext = await f.club(`Ext ${Math.random()}`);
    const m = await f.match({ clubDom: dom.id, clubExt: ext.id, saisonId: (await saisonCourante()).id, scoreDom: 1, scoreExt: 0, statut: "joue" });
    await ds.getRepository(ArbitreMatch).save({ matchId: m.id, arbitreId: arbitre.id, role: "principal" });
    for (const [i, c] of cartons.entries()) {
      await f.evenement({
        matchId: m.id, type: c.type ?? "carton", sousType: c.sousType ?? "jaune", motif: c.motif ?? "",
        joueur: `JOUEUR${i} Test`, equipe: i % 2 ? "ext" : "dom", minute: 10 + i,
      });
    }
    return m;
  }
  let saison: Saison | null = null;
  async function saisonCourante() {
    if (!saison) saison = await f.saison("2025-2026", 2025, { actif: true });
    return saison;
  }
  beforeEach(() => { saison = null; });

  it("le decompte des motifs retombe sur le total des cartons : motifs regroupes + cartons sans motif", async () => {
    const arb = await ds.getRepository(Arbitre).save({ nom: "DUPONT", prenom: "Jean" });
    // 5 cartons : 2 motifs (dont une ecriture sans accent), 1 rouge, 2 sans motif.
    await matchArbitre(arb, [
      { motif: "Désapprobation en paroles ou en actes" },
      { motif: "Desapprobation en paroles ou en actes" },
      { motif: "Commet un acte de brutalité", sousType: "rouge" },
      { motif: "" },
      { motif: "   " },
    ]);

    await svc.recomputeArbitres();

    const a = await ds.getRepository(Arbitre).findOneByOrFail({ id: arb.id });
    expect(a.cartonsJaunesDonnes + a.cartonsRougesDonnes).toBe(5);
    const [part] = JSON.parse(a.participations);
    expect(part.motifs).toEqual([
      { motif: "Désapprobation en paroles ou en actes", n: 2 },
      { motif: "Commet un acte de brutalité", n: 1 },
    ]);
    expect(part.cartonsSansMotif).toBe(2);
    const somme = part.motifs.reduce((s: number, m: { n: number }) => s + m.n, 0) + part.cartonsSansMotif;
    expect(somme).toBe(part.cartonsJaunesDonnes + part.cartonsRougesDonnes);
    // Le resume court garde les motifs les plus frequents et compte le reste, sans rien perdre.
    expect(a.motifsTop).toBe("Désapprobation en paroles ou en actes (2) · Commet un acte de brutalité (1) · +2 autres");
  });

  it("un arbitre sur deux championnats : chaque participation retombe sur ses propres cartons", async () => {
    const arb = await ds.getRepository(Arbitre).save({ nom: "MARTIN", prenom: "Luc" });
    const s1 = await saisonCourante();
    const s0 = await f.saison("2024-2025", 2024);
    const matchS0 = await matchArbitre(arb, [{ motif: "Retarder la reprise du jeu" }, { motif: "" }]);
    await ds.getRepository(Match).update(matchS0.id, { saisonId: s0.id });
    await matchArbitre(arb, [{ motif: "Comportement antisportif" }, { motif: "Comportement antisportif" }, { motif: "Comportement antisportif" }, { motif: "" }]);

    await svc.recomputeArbitres();

    const a = await ds.getRepository(Arbitre).findOneByOrFail({ id: arb.id });
    const parts: any[] = JSON.parse(a.participations);
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      expect(p.motifs.reduce((s: number, m: { n: number }) => s + m.n, 0) + p.cartonsSansMotif)
        .toBe(p.cartonsJaunesDonnes + p.cartonsRougesDonnes);
    }
    expect(parts.find((p) => p.saisonId === s1.id).motifs).toEqual([{ motif: "Comportement antisportif", n: 3 }]);
    expect(a.cartonsJaunesDonnes).toBe(6);
  });

  describe("reclasserCartonsVerts", () => {
    async function scene() {
      const arb = await ds.getRepository(Arbitre).save({ nom: "DUPONT", prenom: "Jean" });
      // Anciennes imports : 2 vrais jaunes, 1 rouge, et 2 cartons VERTS ranges en jaunes sans motif.
      const m = await matchArbitre(arb, [
        { motif: "Comportement antisportif" },
        { motif: "Retarder la reprise du jeu" },
        { motif: "Commet un acte de brutalité", sousType: "rouge" },
        { motif: "" },
        { motif: "" },
      ]);
      return { arb, m };
    }

    it("simulation par defaut : detecte les cartons jaunes sans motif mais ne modifie rien", async () => {
      const { m } = await scene();

      const r = await svc.reclasserCartonsVerts();

      expect(r).toMatchObject({ appliquer: false, cartonsAvantCorrection: 5, cartonsVertsDetectes: 2, matchsConcernes: 1 });
      expect(await ds.getRepository(EvenementMatch).count({ where: { matchId: m.id, type: "carton" } })).toBe(5);
    });

    it("application : les cartons verts sortent des sanctions et les stats sont recalculees", async () => {
      const { arb, m } = await scene();
      await svc.recomputeArbitres();
      const avant = await ds.getRepository(Arbitre).findOneByOrFail({ id: arb.id });
      expect(avant.cartonsJaunesDonnes).toBe(4);            // 2 vrais jaunes + 2 verts comptes a tort

      const r = await svc.reclasserCartonsVerts(true);

      expect(r.cartonsVertsDetectes).toBe(2);
      expect(await ds.getRepository(EvenementMatch).count({ where: { matchId: m.id, type: "carton" } })).toBe(3);
      expect(await ds.getRepository(EvenementMatch).count({ where: { matchId: m.id, type: "carton_vert", sousType: "vert" } })).toBe(2);
      const apres = await ds.getRepository(Arbitre).findOneByOrFail({ id: arb.id });
      expect(apres.cartonsJaunesDonnes).toBe(2);
      expect(apres.cartonsRougesDonnes).toBe(1);
      const [part] = JSON.parse(apres.participations);
      expect(part.cartonsSansMotif).toBe(0);                  // plus aucun carton sans motif : 3 cartons, 3 motifs
    });

    it("un rouge sans motif n'est jamais reclasse ; deuxieme passage : rien a faire", async () => {
      const arb = await ds.getRepository(Arbitre).save({ nom: "X", prenom: "Y" });
      await matchArbitre(arb, [{ sousType: "rouge", motif: "" }, { motif: "" }]);

      expect((await svc.reclasserCartonsVerts(true)).cartonsVertsDetectes).toBe(1);
      expect((await svc.reclasserCartonsVerts(true)).cartonsVertsDetectes).toBe(0);
    });
  });

  describe("fatigue des joueurs", () => {
    const jour = (j: number) => {
      const d = new Date(2026, 9, 14 - j);
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    };
    const figerLHorloge = (date: Date) =>
      jest.useFakeTimers({
        now: date,
        // Seule la date est simulee : la base en memoire a besoin des timers reels.
        doNotFake: ["hrtime", "nextTick", "performance", "queueMicrotask", "setImmediate", "clearImmediate",
          "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
      });
    afterEach(() => jest.useRealTimers());

    async function equipeAvecCharge() {
      const s = await f.saison("2026-2027", 2026, { actif: true });
      const moi = await f.club("OL Sud");
      const adv = await f.club("Adverse");
      const eqMoi = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s.id });
      const eqAdv = await f.equipe({ clubId: adv.id, nom: "Adverse", categorie: "Seniors", saisonId: s.id });
      const ali = await f.joueur({ nom: "ALI", prenom: "Ben", clubId: moi.id, licence: "1111111111" });
      // 4 semaines : 2 seances + 1 match par semaine (jeudi / samedi / dimanche), Ali present partout.
      for (let sem = 0; sem < 4; sem++) {
        for (const j of [sem * 7 + 2, sem * 7 + 4]) {
          await ds.getRepository(Entrainement).save({
            equipeId: eqMoi.id, date: jour(j), dureeMin: 90, intensite: 6, charge: 513, joueursPresents: [ali.id], presents: 1, total: 1,
          });
        }
        const m = await f.match({
          clubDom: moi.id, clubExt: adv.id, equipeDomId: eqMoi.id, equipeExtId: eqAdv.id, saisonId: s.id,
          date: jour(sem * 7 + 6), scoreDom: 1, scoreExt: 0, statut: "joue",
        });
        await f.compo({ matchId: m.id, cote: "dom", nom: "ALI", prenom: "Ben", licence: "1111111111" });
        await f.compo({ matchId: m.id, cote: "ext", nom: "ZED", prenom: "Ali", licence: "2222222222", numero: 9 });
      }
      return { ali, moi, adv };
    }

    it("calcule la fatigue d'un joueur de mon effectif depuis ses seances ET ses matchs", async () => {
      figerLHorloge(new Date(2026, 9, 14, 12));
      const { ali } = await equipeAvecCharge();

      await svc.recomputeJoueurs();

      const j = await ds.getRepository(Joueur).findOneByOrFail({ id: ali.id });
      expect(j.scoreFatigue).not.toBeNull();
      expect(j.acwr).toBeGreaterThan(0.85);
      expect(j.acwr).toBeLessThan(1.2);
      expect(j.chargeAcute7j).toBeGreaterThan(0);
      const detail = JSON.parse(j.fatigueDetail);
      expect(detail.facteurs.map((x: { cle: string }) => x.cle)).toEqual(["acwr", "residuelle", "congestion", "vulnerabilite"]);
      expect(detail.fiabilite).toBe("solide");                 // seances connues + plus de 2 semaines d'historique
      expect(detail.matchs14j).toBe(2);
    });

    it("sans les seances la fatigue serait plus basse : l'entrainement compte vraiment", async () => {
      figerLHorloge(new Date(2026, 9, 14, 12));
      const { ali } = await equipeAvecCharge();
      await svc.recomputeJoueurs();
      const avec = (await ds.getRepository(Joueur).findOneByOrFail({ id: ali.id })).chargeAcute7j;

      await ds.getRepository(Entrainement).clear();
      await svc.recomputeJoueurs();
      const sans = (await ds.getRepository(Joueur).findOneByOrFail({ id: ali.id })).chargeAcute7j;

      expect(avec).toBeGreaterThan(sans);
    });

    it("un adversaire n'a pas de seances connues : estimation sur ses matchs, fiabilite partielle", async () => {
      figerLHorloge(new Date(2026, 9, 14, 12));
      await equipeAvecCharge();

      await svc.recomputeJoueurs();

      const zed = await ds.getRepository(Joueur).findOneOrFail({ where: { nom: "ZED" } });
      expect(zed.scoreFatigue).not.toBeNull();
      expect(JSON.parse(zed.fatigueDetail).fiabilite).toBe("partielle");
    });

    it("la fatigue se lit au jour J : dix jours de repos plus tard, sans nouvel import, le joueur est plus frais", async () => {
      figerLHorloge(new Date(2026, 9, 14, 12));
      const { ali } = await equipeAvecCharge();
      await svc.recomputeJoueurs();
      const aujourdhui = await ds.getRepository(Joueur).findOneByOrFail({ id: ali.id });

      figerLHorloge(new Date(2026, 9, 24, 12));
      const dixJoursPlusTard = await ds.getRepository(Joueur).findOneByOrFail({ id: ali.id });

      expect(dixJoursPlusTard.scoreFatigue!).toBeLessThan(aujourdhui.scoreFatigue!);
      expect(JSON.parse(dixJoursPlusTard.fatigueDetail).calculeLe).toContain("2026-10-24");
    });

    it("joueur indisponible : pas de score de fatigue", async () => {
      figerLHorloge(new Date(2026, 9, 14, 12));
      const { ali } = await equipeAvecCharge();
      await ds.getRepository(Blessure).save({ joueurId: ali.id, joueurNom: "ALI Ben", statut: "Indisponible", dateDebut: jour(1) });

      await svc.recomputeJoueurs();

      const j = await ds.getRepository(Joueur).findOneByOrFail({ id: ali.id });
      expect(j.scoreFatigue).toBeNull();
      expect(JSON.parse(j.fatigueDetail).raison).toBe("indisponible");
    });

    it("aucun effort sur 28 jours : pas de score", async () => {
      figerLHorloge(new Date(2026, 11, 20, 12));                 // deux mois apres les dernieres donnees
      const { ali } = await equipeAvecCharge();
      await svc.recomputeJoueurs();
      expect((await ds.getRepository(Joueur).findOneByOrFail({ id: ali.id })).scoreFatigue).toBeNull();
    });
  });
});
