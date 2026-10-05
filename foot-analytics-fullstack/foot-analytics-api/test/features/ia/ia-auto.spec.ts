// Le reentrainement automatique : la regle de securite (un nouveau modele ne remplace l'actif que s'il fait au moins aussi
// bien, sinon il reste dans l'historique) et le calendrier du mercredi, de bout en bout sur une vraie base de test.

import { DataSource } from "typeorm";

import * as entrainement from "@/features/ia/ia-entrainement";
import { IaEntrainement } from "@/features/ia/ia-entrainement.entity";
import { IaModele } from "@/features/ia/ia-modele.entity";
import { IaReglage } from "@/features/ia/ia-reglage.entity";
import { prochainPassage } from "@/features/ia/ia-planning";
import { IaService } from "@/features/ia/ia.service";
import type { EntreesDonnees } from "@/features/ia/ia-donnees";
import { creerBaseTest } from "@test/support/test-db";
import { creerIaService, insererLigue, ligue } from "./ligue";

/** Les matchs des journees `de` a `a` (1 = premiere semaine), avec leurs feuilles. */
function journees(e: EntreesDonnees, de: number, a: number): EntreesDonnees {
  const matchs = e.matchs.filter((m) => Number(m.journee) >= de && Number(m.journee) <= a);
  const ids = new Set(matchs.map((m) => m.id));
  return { ...e, matchs, compos: e.compos.filter((c) => ids.has(c.matchId)) };
}

describe("reentrainement automatique", () => {
  let ds: DataSource;
  let svc: IaService;
  const toute = ligue({ clubs: 6, semaines: 16, graine: 7 });

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = creerIaService(ds);
  });
  afterEach(async () => { jest.restoreAllMocks(); await ds.destroy(); });

  const lancerAuto = async (maintenant = Date.now()) => {
    const lance = await svc.lancer(null, { optimiser: false }, "auto", maintenant);
    await svc.attendre(lance.id);
    return svc.detail(lance.id);
  };
  const manuel = async () => {
    const lance = await svc.lancer("admin-1", { optimiser: false });
    await svc.attendre(lance.id);
    return svc.detail(lance.id);
  };
  const actifs = async () => (await ds.getRepository(IaModele).find({ where: { actif: true } })).map((m) => m.id);

  /** Un modele actif entraine sur les dix premieres semaines, puis six semaines de plus en base. */
  async function avecModeleActif() {
    await insererLigue(ds, journees(toute, 1, 10));
    const premier = await manuel();
    await svc.activer(premier.modele!.id);
    await insererLigue(ds, journees(toute, 11, 16));
    return premier.modele!;
  }

  it("nouveau modele meilleur : il remplace l'actif (qui reste dans l'historique), la comparaison est enregistree", async () => {
    const ancien = await avecModeleActif();
    // Un modele actif sans aucun apprentissage (poids nuls : tous les joueurs a 50 %) : le nouveau fait forcement mieux.
    const m = await ds.getRepository(IaModele).findOneByOrFail({ id: ancien.id });
    m.poids = { ...m.poids, titularisation: { ...m.poids.titularisation, w: m.poids.titularisation.w.map(() => 0) } };
    await ds.getRepository(IaModele).save(m);

    const fin = await lancerAuto();
    expect(fin).toMatchObject({ statut: "termine", declencheur: "auto", lancePar: null });
    expect(fin.decision).toMatchObject({ action: "remplace", appliquee: true, comparaison: { actif: { id: ancien.id }, semaines: 6 } });
    expect(fin.decision!.comparaison!.feuilles).toBeGreaterThanOrEqual(36);
    expect(fin.decision!.comparaison!.nouveau.onze!).toBeGreaterThan(fin.decision!.comparaison!.ancien.onze!);
    expect(await actifs()).toEqual([fin.modele!.id]);
    expect((await svc.modeleActif())?.id).toBe(fin.modele!.id);
    expect(await ds.getRepository(IaModele).count()).toBe(2);                   // l'ancien n'est pas supprime
  });

  it("nouveau modele moins bon : l'actif reste en place, le nouveau est garde dans l'historique, non actif", async () => {
    const ancien = await avecModeleActif();
    const reel = entrainement.entrainer;
    jest.spyOn(entrainement, "entrainer").mockImplementationOnce(async (jeu, options) => {
      const r = await reel(jeu, options);
      // Le nouveau a fait un peu moins bien que l'actif sur les memes feuilles.
      const c = r.comparaison!;
      return { ...r, comparaison: { ...c, nouveau: { ...c.nouveau, onze: 0.5 }, ancien: { ...c.ancien, onze: 0.6 } } };
    });
    const fin = await lancerAuto();
    expect(fin.decision).toMatchObject({ action: "conserve", appliquee: false });
    expect(fin.decision!.raison).toMatch(/Moins bon que Modele n°1.*historique/);
    expect(await actifs()).toEqual([ancien.id]);
    expect(fin.modele).toMatchObject({ nom: "Modele n°2", actif: false });          // garde dans l'historique des modeles
    expect((await svc.listeModeles()).map((x) => x.nom).sort()).toEqual(["Modele n°1", "Modele n°2"]);
    expect((await svc.modeleActif())?.id).toBe(ancien.id);
  });

  it("aussi bon : il remplace ; trop peu de feuilles nouvelles pour comparer : l'actif est conserve", async () => {
    const ancien = await avecModeleActif();
    const reel = entrainement.entrainer;
    jest.spyOn(entrainement, "entrainer").mockImplementationOnce(async (jeu, options) => {
      const r = await reel(jeu, options);
      const c = r.comparaison!;
      return { ...r, comparaison: { ...c, nouveau: { onze: 0.7, postes: null, perte: 0.4 }, ancien: { onze: 0.7, postes: null, perte: 0.4 } } };
    });
    expect((await lancerAuto()).decision).toMatchObject({ action: "remplace", appliquee: true });

    // Aucune semaine nouvelle depuis ce modele (il a tout vu) : la comparaison est impossible, rien ne change.
    const actifAvant = await actifs();
    const fin = await lancerAuto();
    expect(fin.decision).toMatchObject({ action: "conserve", appliquee: false, comparaison: null });
    expect(fin.decision!.raison).toMatch(/comparaison impossible/);
    expect(await actifs()).toEqual(actifAvant);
    expect(await ds.getRepository(IaModele).count()).toBe(3);
    expect(ancien.id).not.toBe(actifAvant[0]);
  });

  it("aucun modele actif : le nouveau est range dans l'historique, jamais active tout seul", async () => {
    await insererLigue(ds, toute);
    const fin = await lancerAuto();
    expect(fin.decision).toMatchObject({ action: "sans_actif", appliquee: false, comparaison: null });
    expect(await actifs()).toEqual([]);
    expect(await svc.modeleActif()).toBeNull();
    expect(fin.modele!.actif).toBe(false);
  });

  it("un lancement manuel recoit l'avis mais n'active jamais : c'est l'administrateur qui decide", async () => {
    const ancien = await avecModeleActif();
    const m = await ds.getRepository(IaModele).findOneByOrFail({ id: ancien.id });
    m.poids = { ...m.poids, titularisation: { ...m.poids.titularisation, w: m.poids.titularisation.w.map(() => 0) } };
    await ds.getRepository(IaModele).save(m);
    const fin = await manuel();
    expect(fin.declencheur).toBe("manuel");
    expect(fin.decision).toMatchObject({ action: "remplace", appliquee: false });
    expect(await actifs()).toEqual([ancien.id]);
  });

  it("un modele deja entraine par l'ancienne version (sans derniere semaine memorisee) se compare quand meme", async () => {
    const ancien = await avecModeleActif();
    const m = await ds.getRepository(IaModele).findOneByOrFail({ id: ancien.id });
    const { derniereSemaine, ...ancienResume } = m.resume;
    expect(derniereSemaine).toBeGreaterThan(0);
    m.resume = ancienResume as typeof m.resume;
    await ds.getRepository(IaModele).save(m);
    // La limite se retrouve dans le resultat de son entrainement (derniere date vue).
    const e = await ds.getRepository(IaEntrainement).findOneByOrFail({ id: m.entrainementId });
    delete (e.resultat!.donnees as { derniereSemaine?: number | null }).derniereSemaine;
    await ds.getRepository(IaEntrainement).save(e);
    const fin = await lancerAuto();
    expect(fin.decision!.comparaison).toMatchObject({ semaines: 6 });
  });

  describe("planning : chaque mercredi a 5 h, rattrape, jamais deux fois par semaine", () => {
    const H = 3_600_000;
    // Deux mercredis futurs consecutifs (5 h a Paris) a partir de maintenant.
    const mercredi1 = prochainPassage(Date.now());
    const mercredi2 = prochainPassage(mercredi1 + 1);

    it("par defaut actif, sans rattraper la semaine en cours ; le prochain passage est annonce", async () => {
      const t0 = mercredi1 - 3 * 86_400_000;
      const p = await svc.planning(t0);
      expect(p).toMatchObject({ actif: true, jour: 3, heure: 5, fuseau: "Europe/Paris", dernier: null });
      expect(p.prochain).toBe(new Date(mercredi1).toISOString());
      expect(await svc.verifierPlanning(t0 + H)).toBeNull();                            // pas encore mercredi
      expect(await svc.verifierPlanning(mercredi1 - H)).toBeNull();                     // une heure avant
    });

    it("le mercredi, l'entrainement de la semaine est lance une fois (rattrapage le jeudi compris), puis la semaine suivante", async () => {
      await insererLigue(ds, toute);
      await svc.planning(mercredi1 - 3 * 86_400_000);                                   // cree le reglage "actif depuis lundi"
      const lance = await svc.verifierPlanning(mercredi1 + H);
      expect(lance).toMatchObject({ statut: "en_cours", declencheur: "auto" });
      await svc.attendre(lance!.id);
      expect(await svc.verifierPlanning(mercredi1 + 2 * H)).toBeNull();                 // deja fait cette semaine
      expect(await svc.verifierPlanning(mercredi1 + 30 * H)).toBeNull();                // le jeudi aussi
      const suivant = await svc.verifierPlanning(mercredi2 + H);
      expect(suivant).not.toBeNull();
      await svc.attendre(suivant!.id);
      expect((await svc.planning(mercredi2 + 2 * H)).dernier).toMatchObject({ id: suivant!.id, declencheur: "auto" });
      expect(await ds.getRepository(IaEntrainement).count({ where: { declencheur: "auto" } })).toBe(2);
    });

    it("serveur eteint le mercredi : l'entrainement est fait des le redemarrage", async () => {
      await insererLigue(ds, toute);
      await svc.planning(mercredi1 - 3 * 86_400_000);
      const lance = await svc.verifierPlanning(mercredi1 + 2 * 86_400_000 + 5 * H);     // vendredi
      expect(lance).not.toBeNull();
      await svc.attendre(lance!.id);
    });

    it("suspendu : jamais ; reactive apres le passage de la semaine : pas d'entrainement immediat", async () => {
      await svc.planning(mercredi1 - 3 * 86_400_000);
      expect((await svc.definirPlanning(false, mercredi1 - 2 * H)).prochain).toBeNull();
      expect(await svc.verifierPlanning(mercredi1 + H)).toBeNull();
      expect(await ds.getRepository(IaReglage).findOneByOrFail({ cle: "planning" })).toMatchObject({ valeur: { actif: false } });
      const rouvert = await svc.definirPlanning(true, mercredi1 + 5 * H);                // jeudi... ou presque : apres le passage
      expect(rouvert).toMatchObject({ actif: true, prochain: new Date(mercredi2).toISOString() });
      expect(await svc.verifierPlanning(mercredi1 + 6 * H)).toBeNull();
    });

    it("un entrainement deja en cours (manuel) : le planning attend, sans erreur", async () => {
      await insererLigue(ds, toute);
      await svc.planning(mercredi1 - 3 * 86_400_000);
      const manuelEnCours = await svc.lancer("admin-1", { optimiser: false });
      expect(await svc.verifierPlanning(mercredi1 + H)).toBeNull();
      await svc.attendre(manuelEnCours.id);
      const lance = await svc.verifierPlanning(mercredi1 + 2 * H);                      // a la prochaine verification
      expect(lance).not.toBeNull();
      await svc.attendre(lance!.id);
    });

    it("un entrainement automatique interrompu par un arret du serveur est repris", async () => {
      await insererLigue(ds, toute);
      await svc.planning(mercredi1 - 3 * 86_400_000);
      const vieux = new Date(mercredi1 + 30 * 60_000).toISOString();
      const interrompu = await ds.getRepository(IaEntrainement).save({
        statut: "en_cours", progression: 30, options: { optimiser: true, saisonIds: null }, declencheur: "auto", maj: vieux, creeLe: vieux,
      } as IaEntrainement);
      // Quelques minutes apres, il donne encore signe de vie : on ne touche a rien.
      expect(await svc.verifierPlanning(mercredi1 + 32 * 60_000)).toBeNull();
      expect((await svc.resume(interrompu.id)).statut).toBe("en_cours");
      // Bien plus tard, plus aucune nouvelle : marque interrompu, puis refait.
      const repris = await svc.verifierPlanning(mercredi1 + 3 * H);
      expect(repris).toMatchObject({ declencheur: "auto", statut: "en_cours" });
      expect(repris!.id).not.toBe(interrompu.id);
      expect(await svc.resume(interrompu.id)).toMatchObject({ statut: "echec", message: expect.stringMatching(/Interrompu/) });
      await svc.attendre(repris!.id);
    });
  });
});
