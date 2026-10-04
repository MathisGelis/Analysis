import { DataSource } from "typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { Club } from "@/features/clubs/club.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { AnalyseService } from "@/features/analyse/analyse.service";
import { estMatchJoue } from "@/features/matchs/match-joue";
import { PrematchService } from "@/features/analyse/prematch.service";

describe("estMatchJoue", () => {
  it("exclut les matchs annules, reportes et programmes (0-0 par defaut)", () => {
    for (const statut of ["annule", "reporte", "prevu", "a_venir"]) {
      expect(estMatchJoue({ statut } as Match)).toBe(false);
    }
    expect(estMatchJoue({ statut: "joue" } as Match)).toBe(true);
    expect(estMatchJoue({ statut: undefined } as unknown as Match)).toBe(true);
  });
});

describe("PrematchService.rapport", () => {
  let ds: DataSource;
  let svc: PrematchService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    const analyse = new AnalyseService(
      ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Joueur),
      ds.getRepository(Composition), ds.getRepository(EvenementMatch), ds.getRepository(Entrainement),
      ds.getRepository(Coach), ds.getRepository(StaffMatch), ds.getRepository(Equipe),
      ds.getRepository(LigneClassement), ds.getRepository(Saison),
    );
    svc = new PrematchService(
      analyse, ds.getRepository(Match), ds.getRepository(Equipe), ds.getRepository(Club),
      ds.getRepository(LigneClassement), ds.getRepository(Saison), ds.getRepository(Arbitre),
    );
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  /** Ma poule : moi, l'adversaire et un tiers ; un match programme moi / adversaire. */
  async function contexte() {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse FC");
    const tiers = await f.club("Tiers AS");
    const s = await f.saison("2025-2026", 2025, { actif: true });
    const commun = { categorie: "Seniors", saisonId: s.id, competitionLibelle: "D2", poule: "A" };
    const eMoi = await f.equipe({ clubId: moi.id, nom: "Seniors", ...commun });
    const eAdv = await f.equipe({ clubId: adv.id, nom: "Seniors", ...commun });
    const eTiers = await f.equipe({ clubId: tiers.id, nom: "Seniors", ...commun });
    const jouer = (dom: Club, ext: Club, eDom: Equipe, eExt: Equipe, date: string, sd: number, se: number, extra: object = {}) =>
      f.match({
        clubDom: dom.id, clubExt: ext.id, equipeDomId: eDom.id, equipeExtId: eExt.id, saisonId: s.id,
        date, scoreDom: sd, scoreExt: se, ...extra,
      });
    return { moi, adv, tiers, s, eMoi, eAdv, eTiers, jouer };
  }

  it("equipe inconnue : 404", async () => {
    const c = await contexte();
    await expect(svc.rapport("nimporte", c.adv.id)).rejects.toThrow(/introuvable/);
  });

  it("club adverse inconnu, ou identique au mien : erreur claire", async () => {
    const c = await contexte();
    await expect(svc.rapport(c.eMoi.id, "nimporte")).rejects.toThrow(/introuvable/);
    await expect(svc.rapport(c.eMoi.id, c.moi.id)).rejects.toThrow(/autre club/);
  });

  it("sans match joue : rapport a froid, pas de piste inventee, pas de match cible", async () => {
    const c = await contexte();
    const r = await svc.rapport(c.eMoi.id, c.adv.id);
    expect(r.match).toBeNull();
    expect(r.analyse).toBeNull();
    expect(r.faceAFace.bilan.joues).toBe(0);
    expect(r.adversaire.clubNom).toBe("Adverse FC");
    expect(r.championnat).toMatchObject({ competition: "D2", poule: "A", saisonNom: "2025-2026", saisonActive: true });
  });

  it("cible le prochain match programme entre les deux clubs, et ignore un 0-0 programme dans les resultats", async () => {
    const c = await contexte();
    const demain = new Date(Date.now() + 7 * 86_400_000);
    const iso = demain.toISOString().slice(0, 10);
    await c.jouer(c.moi, c.adv, c.eMoi, c.eAdv, iso, 0, 0, { statut: "prevu", heure: "15:00", terrain: "Stade A" });
    // Un match deja joue contre un tiers, pour avoir un bilan.
    await c.jouer(c.moi, c.tiers, c.eMoi, c.eTiers, "01/09/2025", 2, 0);
    const r = await svc.rapport(c.eMoi.id, c.adv.id);
    expect(r.match).toMatchObject({ date: iso, heure: "15:00", terrain: "Stade A", domicile: true });
    // Le match programme ne compte pas : seul le 2-0 existe.
    expect(r.monEquipe.matchs).toBe(1);
    expect(r.faceAFace.bilan.joues).toBe(0);
  });

  it("face-a-face : rencontres jouees entre les deux clubs, de mon point de vue, recentes d'abord", async () => {
    const c = await contexte();
    await c.jouer(c.moi, c.adv, c.eMoi, c.eAdv, "10/09/2025", 3, 1);
    await c.jouer(c.adv, c.moi, c.eAdv, c.eMoi, "15/10/2025", 2, 2);
    const r = await svc.rapport(c.eMoi.id, c.adv.id);
    expect(r.faceAFace.bilan).toMatchObject({ joues: 2, v: 1, n: 1, d: 0 });
    expect(r.faceAFace.rencontres[0]).toMatchObject({ date: "15/10/2025", domicile: false, bp: 2, bc: 2, issue: "N" });
  });

  it("face-a-face : ne melange pas les categories (Seniors contre U20)", async () => {
    const c = await contexte();
    const u20Moi = await f.equipe({ clubId: c.moi.id, nom: "U20", categorie: "U20", saisonId: c.s.id });
    const u20Adv = await f.equipe({ clubId: c.adv.id, nom: "U20", categorie: "U20", saisonId: c.s.id });
    await c.jouer(c.moi, c.adv, c.eMoi, c.eAdv, "10/09/2025", 1, 0);
    await c.jouer(c.moi, c.adv, u20Moi, u20Adv, "11/09/2025", 5, 0);
    const r = await svc.rapport(c.eMoi.id, c.adv.id);
    expect(r.faceAFace.bilan.joues).toBe(1);
  });

  it("match designe entre d'autres clubs : refuse", async () => {
    const c = await contexte();
    const autre = await c.jouer(c.moi, c.tiers, c.eMoi, c.eTiers, "01/09/2025", 1, 1);
    await expect(svc.rapport(c.eMoi.id, c.adv.id, autre.id)).rejects.toThrow(/oppose pas/);
    await expect(svc.rapport(c.eMoi.id, c.adv.id, "inconnu")).rejects.toThrow(/introuvable/);
  });

  it("arbitre : retrouve son profil par nom (prenom nom ou nom prenom)", async () => {
    const c = await contexte();
    await ds.getRepository(Arbitre).save(ds.getRepository(Arbitre).create({
      nom: "DUPONT", prenom: "Jean", matchsPrincipal: 10, cartonsJaunesDonnes: 50, cartonsRougesDonnes: 5, profil: "Strict", motifsTop: "Contestation",
    }));
    const m = await c.jouer(c.moi, c.adv, c.eMoi, c.eAdv, "20/12/2030", 0, 0, { statut: "prevu", arbitre: "Jean Dupont" });
    const r = await svc.rapport(c.eMoi.id, c.adv.id, m.id);
    expect(r.arbitre).toMatchObject({ nom: "Jean DUPONT", profil: "Strict", matchsPrincipal: 10, cartonsParMatch: 5.5 });
    // Nom non reconnu : pas d'arbitre, pas d'erreur.
    const m2 = await c.jouer(c.moi, c.adv, c.eMoi, c.eAdv, "27/12/2030", 0, 0, { statut: "prevu", arbitre: "Inconnu Total" });
    expect((await svc.rapport(c.eMoi.id, c.adv.id, m2.id)).arbitre).toBeNull();
  });

  it("rapport detaille de l'adversaire : avertis et joueurs ressortent quand ses matchs sont analyses", async () => {
    const c = await contexte();
    const m = await c.jouer(c.adv, c.tiers, c.eAdv, c.eTiers, "05/10/2025", 1, 0);
    await f.compo({ matchId: m.id, cote: "dom", nom: "ATTAQUANT", prenom: "Leo" });
    await f.evenement({ matchId: m.id, type: "carton", sousType: "jaune", joueur: "ATTAQUANT Leo", equipe: "dom", minute: 80 });
    const r = await svc.rapport(c.eMoi.id, c.adv.id);
    expect(r.analyse).not.toBeNull();
    expect(r.analyse!.matchsAnalyses).toBe(1);
    expect(r.analyse!.avertis[0]).toMatchObject({ nom: expect.stringContaining("ATTAQUANT"), jaunes: 1, rouges: 0 });
    expect(r.analyse!.compoProbable.length).toBeGreaterThan(0);
  });

  describe("systeme adverse et projection", () => {
    it("systeme probable : d'apres les dispositifs RENSEIGNES de l'adversaire, vus de son cote", async () => {
      const c = await contexte();
      // Adverse a domicile (formationDom), puis a l'exterieur (formationExt), puis un match sans dispositif.
      await c.jouer(c.adv, c.tiers, c.eAdv, c.eTiers, "07/09/2025", 1, 0, { formationDom: "4-3-3" });
      await c.jouer(c.tiers, c.adv, c.eTiers, c.eAdv, "14/09/2025", 2, 2, { formationExt: "4-3-3" });
      await c.jouer(c.adv, c.tiers, c.eAdv, c.eTiers, "21/09/2025", 0, 0);

      const r = await svc.rapport(c.eMoi.id, c.adv.id);

      expect(r.systemeAdverse).toMatchObject({ observes: 2, matchs: 3 });
      expect(r.systemeAdverse.prediction).toMatchObject({ systeme: "4-3-3", observations: 2, fiabilite: "faible" });
      expect(r.systemeAdverse.dernierMatchId).toBeTruthy();
      expect(r.pistes.some((x) => x.titre === "Systeme probable : 4-3-3")).toBe(true);
    });

    it("sans dispositif renseigne, le systeme se lit dans les changements de numero (BU puis MO : deux attaquants)", async () => {
      const c = await contexte();
      // L'attaquant AVANT porte le 9 puis le 10 d'un match a l'autre ; un gardien et un milieu fixes complettent la feuille.
      for (const [i, date] of ["07/09/2025", "14/09/2025", "21/09/2025", "28/09/2025"].entries()) {
        const m = await c.jouer(c.adv, c.tiers, c.eAdv, c.eTiers, date, 1, 0);
        await f.compo({ matchId: m.id, cote: "dom", nom: "GARDIEN", prenom: "Gil", numero: 1 });
        await f.compo({ matchId: m.id, cote: "dom", nom: "AVANT", prenom: "Leo", numero: i % 2 ? 10 : 9 });
      }

      const r = await svc.rapport(c.eMoi.id, c.adv.id);

      expect(r.systemeAdverse.prediction).toBeNull();
      expect(r.systemeAdverse.probable).toMatchObject({ systeme: "4-4-2", source: "numeros", observations: 0, matchsNumeros: 4 });
      expect(r.systemeAdverse.probable!.confiance).toBeLessThanOrEqual(70);
      expect(r.numeros!.indices[0].texte).toMatch(/AVANT/);
      expect(r.pistes.find((x) => x.titre === "Systeme probable : 4-4-2")!.detail).toMatch(/changements de numero sur 4 feuilles/);
      // Les numeros donnent aussi le onze : le gardien au 1, l'attaquant a son numero le plus recent / frequent.
      expect(r.analyse!.compoProbable).toEqual(expect.arrayContaining([
        expect.objectContaining({ numero: 1, poste: "GB", nom: "Gil GARDIEN" }),
      ]));
    });

    it("dispositif renseigne ET numeros : les deux sont fusionnes, le dispositif saisi gardant la tete", async () => {
      const c = await contexte();
      for (const [i, date] of ["07/09/2025", "14/09/2025", "21/09/2025", "28/09/2025"].entries()) {
        const m = await c.jouer(c.adv, c.tiers, c.eAdv, c.eTiers, date, 1, 0, { formationDom: "4-3-3" });
        await f.compo({ matchId: m.id, cote: "dom", nom: "AVANT", prenom: "Leo", numero: i % 2 ? 10 : 9 });
      }

      const r = await svc.rapport(c.eMoi.id, c.adv.id);

      expect(r.systemeAdverse.prediction).toMatchObject({ systeme: "4-3-3", observations: 4 });
      expect(r.systemeAdverse.probable).toMatchObject({ systeme: "4-3-3", source: "mixte", observations: 4, matchsNumeros: 4 });
      expect(r.systemeAdverse.probable!.alternatives.map((a) => a.systeme)).toContain("4-4-2");
    });

    it("numeros de saison (hors 1-11) : aucun systeme ni poste deduits des numeros", async () => {
      const c = await contexte();
      for (const [i, date] of ["07/09/2025", "14/09/2025", "21/09/2025"].entries()) {
        const m = await c.jouer(c.adv, c.tiers, c.eAdv, c.eTiers, date, 1, 0);
        await f.compo({ matchId: m.id, cote: "dom", nom: "AVANT", prenom: "Leo", numero: i % 2 ? 19 : 29 });
      }

      const r = await svc.rapport(c.eMoi.id, c.adv.id);

      expect(r.systemeAdverse.probable).toBeNull();
      expect(r.numeros!.fiabilite.exploitable).toBe(false);
      expect(r.numeros!.notes[0]).toMatch(/Numeros peu fiables/);
      expect(r.analyse!.compoProbable).toHaveLength(1);       // repli : les titulaires les plus utilises
    });

    it("le couple 4-4-2 / 4-2-3-1 ecrit en dur par l'ancien import n'est jamais une observation", async () => {
      const c = await contexte();
      for (const [i, date] of ["07/09/2025", "14/09/2025", "21/09/2025"].entries()) {
        await c.jouer(i % 2 ? c.tiers : c.adv, i % 2 ? c.adv : c.tiers, i % 2 ? c.eTiers : c.eAdv, i % 2 ? c.eAdv : c.eTiers, date, 1, 1,
          { formationDom: "4-4-2", formationExt: "4-2-3-1" });
      }

      const r = await svc.rapport(c.eMoi.id, c.adv.id);

      expect(r.systemeAdverse).toMatchObject({ prediction: null, observes: 0, matchs: 3 });
      expect(r.pistes.some((x) => x.titre.startsWith("Systeme probable"))).toBe(false);
    });

    it("projection de resultat : absente sous 5 matchs joues de chaque cote, puis de somme 100", async () => {
      const c = await contexte();
      await c.jouer(c.moi, c.tiers, c.eMoi, c.eTiers, "07/09/2025", 2, 0);
      expect((await svc.rapport(c.eMoi.id, c.adv.id)).projection).toBeNull();

      for (let i = 0; i < 5; i++) {
        await c.jouer(c.moi, c.tiers, c.eMoi, c.eTiers, `0${i + 1}/10/2025`, 2, 1);
        await c.jouer(c.adv, c.tiers, c.eAdv, c.eTiers, `0${i + 1}/11/2025`, 1, 1);
      }
      const p = (await svc.rapport(c.eMoi.id, c.adv.id)).projection!;

      expect(p.pV + p.pN + p.pD).toBe(100);
      expect(p.matchs).toBe(5);
      expect(p.pV).toBeGreaterThan(p.pD);       // je marque plus et encaisse moins que l'adversaire
    });
  });
});
