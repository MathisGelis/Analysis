import { DataSource } from "typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { Blessure } from "@/features/blessures/blessure.entity";
import { Club } from "@/features/clubs/club.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { Tactique } from "@/features/tactiques/tactique.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { DerivationService } from "@/features/derivation/derivation.service";

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

  describe("club actuel et mutation", () => {
    /** Deux saisons, trois clubs ; un match de la saison `s` ou `joueur` joue pour `club` contre `adv`. */
    async function contexte() {
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026, { actif: true });
      const mions = await f.club("Mions");
      const ol = await f.club("OL Sud");
      const adv = await f.club("Adverse");
      const jouer = async (club: Club, saison: Saison, date: string, joueur: { nom: string; prenom: string; licence?: string }) => {
        const m = await f.match({ clubDom: club.id, clubExt: adv.id, saisonId: saison.id, date, scoreDom: 1, scoreExt: 0, statut: "joue" });
        await f.compo({ matchId: m.id, cote: "dom", ...joueur });
        return m;
      };
      return { s25, s26, mions, ol, adv, jouer };
    }
    const fiche = (nom: string) => ds.getRepository(Joueur).findOneByOrFail({ nom });

    it.each([["chronologique (le cas reel : l'ancien club est lu en premier)", false], ["inverse", true]])(
      "un joueur qui change de club est rattache au club de son match le plus RECENT, insertion %s",
      async (_ordre, inverse) => {
        const c = await contexte();
        const guedes = { nom: "GUEDES", prenom: "Matteo", licence: "2544602641" };
        const anciens = () => Promise.all([
          c.jouer(c.mions, c.s25, "07/12/2025", guedes), c.jouer(c.mions, c.s25, "22/11/2025", guedes),
        ]);
        if (inverse) { await c.jouer(c.ol, c.s26, "06/09/2026", guedes); await anciens(); }
        else { await anciens(); await c.jouer(c.ol, c.s26, "06/09/2026", guedes); }

        await svc.recomputeJoueurs();

        expect((await fiche("GUEDES")).clubId).toBe(c.ol.id);
      },
    );

    it("la fiche creee sur l'ancien club est reparee au recalcul suivant", async () => {
      const c = await contexte();
      const guedes = { nom: "GUEDES", prenom: "Matteo", licence: "2544602641" };
      await f.joueur({ ...guedes, clubId: c.mions.id, statutMutation: "Non connu" });
      await c.jouer(c.mions, c.s25, "07/12/2025", guedes);
      await c.jouer(c.ol, c.s26, "06/09/2026", guedes);

      await svc.recomputeJoueurs();

      const j = await fiche("GUEDES");
      expect(j.clubId).toBe(c.ol.id);
      expect(await ds.getRepository(Joueur).count({ where: { nom: "GUEDES" } })).toBe(1);
      // Club different de la saison precedente : Mutation par defaut (il etait "Non connu").
      expect(j.statutMutation).toBe("Mutation");
    });

    it("club different : la saisie du staff est respectee, le calcul ne la remplace pas", async () => {
      const c = await contexte();
      const horsDelai = { nom: "HORS", prenom: "Delai", licence: "301" };
      const voulu = { nom: "VOULU", prenom: "Pas", licence: "302" };
      await f.joueur({ ...horsDelai, clubId: c.ol.id, statutMutation: "Mutation hors delai" });
      await f.joueur({ ...voulu, clubId: c.ol.id, statutMutation: "Pas mutation", statutMutationSaisi: true });
      for (const j of [horsDelai, voulu]) {
        await c.jouer(c.mions, c.s25, "07/12/2025", j);
        await c.jouer(c.ol, c.s26, "06/09/2026", j);
      }

      await svc.recomputeJoueurs();

      expect((await fiche("HORS")).statutMutation).toBe("Mutation hors delai");
      expect((await fiche("VOULU")).statutMutation).toBe("Pas mutation");
    });

    it("un Pas mutation non saisi (calcule ou par defaut) devient Mutation quand le club change", async () => {
      const c = await contexte();
      const arrive = { nom: "ARRIVE", prenom: "Tom", licence: "303" };
      await f.joueur({ ...arrive, clubId: c.ol.id, statutMutation: "Pas mutation" });   // defaut de l'epoque
      await c.jouer(c.mions, c.s25, "07/12/2025", arrive);
      await c.jouer(c.ol, c.s26, "06/09/2026", arrive);

      await svc.recomputeJoueurs();

      expect((await fiche("ARRIVE")).statutMutation).toBe("Mutation");
    });

    it("joueur du club l'an dernier, rattache a l'effectif cette saison sans avoir joue : Pas mutation", async () => {
      const c = await contexte();
      const fidele = { nom: "RESTE", prenom: "Sam", licence: "304" };
      const equipe26 = await f.equipe({ clubId: c.ol.id, nom: "Seniors", categorie: "Seniors", saisonId: c.s26.id });
      await f.joueur({ ...fidele, clubId: c.ol.id, statutMutation: "Non connu", equipesAttachees: [equipe26.id] });
      await c.jouer(c.ol, c.s25, "07/12/2025", fidele);      // jouait au club l'an dernier, aucun match cette saison

      await svc.recomputeJoueurs();

      expect((await fiche("RESTE")).statutMutation).toBe("Pas mutation");
    });

    it("arrive d'un autre club et rattache a l'effectif sans avoir joue : Mutation", async () => {
      const c = await contexte();
      const nouveau = { nom: "NOUVEAU", prenom: "Zed", licence: "305" };
      const equipe26 = await f.equipe({ clubId: c.ol.id, nom: "Seniors", categorie: "Seniors", saisonId: c.s26.id });
      await f.joueur({ ...nouveau, clubId: c.mions.id, statutMutation: "Non connu", equipesAttachees: [equipe26.id] });
      await c.jouer(c.mions, c.s25, "07/12/2025", nouveau);

      await svc.recomputeJoueurs();

      const j = await fiche("NOUVEAU");
      expect(j.statutMutation).toBe("Mutation");
      expect(j.clubId).toBe(c.ol.id);          // son club est celui de l'effectif auquel il est rattache
    });

    it("meme club cette saison et la precedente : Pas mutation, meme si une autre valeur etait saisie", async () => {
      const c = await contexte();
      const fidele = { nom: "FIDELE", prenom: "Paul", licence: "111" };
      await f.joueur({ ...fidele, clubId: c.ol.id, statutMutation: "Mutation hors delai" });
      await c.jouer(c.ol, c.s25, "07/12/2025", fidele);
      await c.jouer(c.ol, c.s26, "06/09/2026", fidele);

      await svc.recomputeJoueurs();

      expect((await fiche("FIDELE")).statutMutation).toBe("Pas mutation");
    });

    it("une seule saison connue ou une saison manquante entre les deux : la valeur saisie est conservee", async () => {
      const c = await contexte();
      const recent = { nom: "RECENT", prenom: "Rio", licence: "222" };
      await f.joueur({ ...recent, clubId: c.ol.id, statutMutation: "Mutation" });
      await c.jouer(c.ol, c.s26, "06/09/2026", recent);

      await svc.recomputeJoueurs();

      expect((await fiche("RECENT")).statutMutation).toBe("Mutation");
    });
  });

  describe("formations inventees par l'ancien import", () => {
    async function matchs() {
      const a = await f.club("A");
      const b = await f.club("B");
      const invente = await f.match({ clubDom: a.id, clubExt: b.id, numeroFmi: "1", formationDom: "4-4-2", formationExt: "4-2-3-1" });
      const saisi = await f.match({ clubDom: a.id, clubExt: b.id, numeroFmi: "2", formationDom: "4-3-3", formationExt: "3-5-2" });
      const manuel = await f.match({ clubDom: a.id, clubExt: b.id, formationDom: "4-4-2", formationExt: "4-2-3-1" });   // sans feuille FMI
      return { invente, saisi, manuel };
    }

    it("simulation par defaut : compte les dispositifs inventes sans rien modifier", async () => {
      const m = await matchs();

      const r = await svc.effacerFormationsInventees();

      expect(r).toMatchObject({ appliquer: false, feuillesImportees: 2, dispositifsInventes: 1 });
      expect((await ds.getRepository(Match).findOneByOrFail({ id: m.invente.id })).formationDom).toBe("4-4-2");
    });

    it("application : efface les feuilles importees portant exactement le couple, pas les saisies ni les matchs sans FMI", async () => {
      const m = await matchs();

      await svc.effacerFormationsInventees(true);

      const lire = (id: string) => ds.getRepository(Match).findOneByOrFail({ id });
      expect(await lire(m.invente.id)).toMatchObject({ formationDom: null, formationExt: null });
      expect(await lire(m.saisi.id)).toMatchObject({ formationDom: "4-3-3", formationExt: "3-5-2" });
      expect(await lire(m.manuel.id)).toMatchObject({ formationDom: "4-4-2", formationExt: "4-2-3-1" });
      expect((await svc.effacerFormationsInventees(true)).dispositifsInventes).toBe(0);     // idempotent
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

describe("DerivationService - matchs programmes en double", () => {
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

  async function deuxProgrammes() {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s = await f.saison("2026-2027", 2026, { actif: true });
    const eq = await f.equipe({ clubId: moi.id, nom: "Seniors", saisonId: s.id });
    // Le premier (plus ancien) est vide ; le second est le mieux renseigne : c'est lui qu'on garde.
    const vide = await f.match({ clubDom: moi.id, clubExt: adv.id, date: "2026-10-18", statut: "prevu" });
    const riche = await f.match({
      clubDom: moi.id, clubExt: adv.id, date: "18/10/2026", heure: "15:00", statut: "prevu",
      equipeDomId: eq.id, saisonId: s.id,
    });
    return { moi, adv, s, eq, vide, riche };
  }

  it("la reconstruction supprime le doublon et garde le match le plus renseigne", async () => {
    const { riche } = await deuxProgrammes();

    const res = await svc.rebuildAll();

    expect(res.doublonsSupprimes).toBe(1);
    const restants = await ds.getRepository(Match).find();
    expect(restants.map((m) => m.id)).toEqual([riche.id]);
  });

  it("le plan de jeu du doublon supprime passe sur le match conserve", async () => {
    const { eq, vide, riche } = await deuxProgrammes();
    const tactiques = ds.getRepository(Tactique);
    await tactiques.save({ id: "t1", equipeId: eq.id, matchId: vide.id, formation: "4-3-3", titulaires: [], remplacants: [] } as any);

    await svc.rebuildAll();

    expect((await tactiques.findOneByOrFail({ id: "t1" })).matchId).toBe(riche.id);
  });

  it("si le match conserve a deja son plan pour la meme equipe, celui du doublon est ecarte", async () => {
    const { eq, vide, riche } = await deuxProgrammes();
    const tactiques = ds.getRepository(Tactique);
    await tactiques.save({ id: "t-garde", equipeId: eq.id, matchId: riche.id, formation: "4-4-2", titulaires: [], remplacants: [] } as any);
    await tactiques.save({ id: "t-doublon", equipeId: eq.id, matchId: vide.id, formation: "4-3-3", titulaires: [], remplacants: [] } as any);

    await svc.rebuildAll();

    const restantes = await tactiques.find();
    expect(restantes.map((t) => [t.id, t.matchId])).toEqual([["t-garde", riche.id]]);
  });

  it("deux matchs identiques dont l'un est joue : aucun n'est supprime", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    await f.match({ clubDom: moi.id, clubExt: adv.id, date: "2026-10-18", statut: "prevu" });
    await f.match({ clubDom: moi.id, clubExt: adv.id, date: "2026-10-18", statut: "joue", scoreDom: 1, scoreExt: 0, numeroFmi: "9" });

    const res = await svc.rebuildAll();

    expect(res.doublonsSupprimes).toBe(0);
    expect(await ds.getRepository(Match).count()).toBe(2);
  });
});
