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
});
