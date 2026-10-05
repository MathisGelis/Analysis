import { ConflictException, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Club } from "@/features/clubs/club.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { IaEntrainement } from "@/features/ia/ia-entrainement.entity";
import { IaModele } from "@/features/ia/ia-modele.entity";
import { IaService } from "@/features/ia/ia.service";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { creerBaseTest } from "@test/support/test-db";
import { insererLigue, ligue } from "./ligue";

describe("IaService", () => {
  let ds: DataSource;
  let svc: IaService;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new IaService(
      ds.getRepository(Match), ds.getRepository(Equipe), ds.getRepository(Club), ds.getRepository(Composition),
      ds.getRepository(Saison), ds.getRepository(IaEntrainement), ds.getRepository(IaModele),
    );
  });
  afterEach(() => ds.destroy());

  const lancerEtAttendre = async (demande: Parameters<IaService["lancer"]>[1] = { optimiser: false }) => {
    const lance = await svc.lancer("admin-1", demande);
    await svc.attendre(lance.id);
    return svc.detail(lance.id);
  };

  it("un entrainement complet : lance en arriere-plan, termine, avec son resultat et un modele (inactif)", async () => {
    await insererLigue(ds, ligue({ clubs: 6, semaines: 10 }));
    const lance = await svc.lancer("admin-1", { optimiser: false });
    expect(lance).toMatchObject({ statut: "en_cours", lancePar: "admin-1", options: { optimiser: false, saisonIds: null }, modele: null });

    await svc.attendre(lance.id);
    const fin = await svc.detail(lance.id);
    expect(fin).toMatchObject({ statut: "termine", progression: 100, message: "Termine" });
    expect(fin.termineLe).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fin.resultat!.donnees).toMatchObject({ etapes: 10, equipes: 6 });
    expect(fin.resultat!.courbe).toHaveLength(10);
    expect(fin.resultat!.global.modele.n).toBeGreaterThan(40);
    expect(fin.resultat!.saisons).toEqual({ s25: "2025-2026" });
    expect(fin.modele).toMatchObject({ nom: "Modele n°1", actif: false, resume: { semaines: 10, systemeAppris: false } });
    expect(fin.catalogue.titularisation.length).toBe(fin.resultat!.poids.titularisation.w.length);
    expect(fin.poidsInitiaux.titularisation.w).toHaveLength(fin.catalogue.titularisation.length);

    const modeles = await svc.listeModeles();
    expect(modeles).toHaveLength(1);
    expect(modeles[0]).not.toHaveProperty("poids");                      // la liste ne charge pas les poids
    expect(modeles[0].entrainementId).toBe(lance.id);
  });

  it("un seul entrainement a la fois : le second est refuse tant que le premier tourne", async () => {
    await insererLigue(ds, ligue({ clubs: 6, semaines: 10 }));
    const premier = await svc.lancer("admin-1", { optimiser: false });
    await expect(svc.lancer("admin-1")).rejects.toThrow(ConflictException);
    await svc.attendre(premier.id);
    const second = await svc.lancer("admin-1", { optimiser: false });
    await svc.attendre(second.id);
    expect((await svc.liste()).map((e) => e.statut)).toEqual(["termine", "termine"]);
    expect((await svc.listeModeles()).map((m) => m.nom).sort()).toEqual(["Modele n°1", "Modele n°2"]);
  });

  it("annulation : l'entrainement s'arrete, aucun modele n'est cree", async () => {
    await insererLigue(ds, ligue({ clubs: 8, semaines: 25 }));
    const lance = await svc.lancer("admin-1", { optimiser: true });
    const apres = await svc.annuler(lance.id);
    expect(apres).toMatchObject({ statut: "annule", message: "Annule par l'administrateur.", modele: null });
    expect(await svc.listeModeles()).toEqual([]);
    // Et un nouvel entrainement est de nouveau possible.
    const suivant = await svc.lancer("admin-1", { optimiser: false });
    await svc.attendre(suivant.id);
    expect((await svc.resume(suivant.id)).statut).toBe("termine");
  });

  it("donnees insuffisantes : echec avec une explication claire, jamais une erreur technique", async () => {
    const fin = await lancerEtAttendre();
    expect(fin.statut).toBe("echec");
    expect(fin.message).toMatch(/au moins deux semaines/);
    expect(fin.modele).toBeNull();
    expect(await svc.listeModeles()).toEqual([]);
  });

  it("restreint aux saisons demandees", async () => {
    await insererLigue(ds, ligue({ clubs: 6, semaines: 10 }));
    const toutes = await lancerEtAttendre({ optimiser: false });
    const aucune = await lancerEtAttendre({ optimiser: false, saisonIds: ["autre-saison"] });
    expect(toutes.statut).toBe("termine");
    expect(aucune.statut).toBe("echec");
    expect(aucune.options.saisonIds).toEqual(["autre-saison"]);
  });

  it("un entrainement 'en cours' sans tache vivante (serveur arrete) est marque interrompu", async () => {
    const orphelin = await ds.getRepository(IaEntrainement).save({ statut: "en_cours", progression: 40, options: { optimiser: true, saisonIds: null }, creeLe: new Date().toISOString() } as IaEntrainement);
    await svc.onModuleInit();
    expect(await svc.resume(orphelin.id)).toMatchObject({ statut: "echec", message: expect.stringMatching(/Interrompu/) });
    // Et il ne bloque pas un nouvel entrainement.
    await insererLigue(ds, ligue({ clubs: 4, semaines: 6 }));
    const suivant = await svc.lancer(null, { optimiser: false });
    await svc.attendre(suivant.id);
    expect((await svc.resume(suivant.id)).statut).toBe("termine");
  });

  it("modele actif : un seul a la fois, lu par la prediction, retire par la desactivation", async () => {
    await insererLigue(ds, ligue({ clubs: 4, semaines: 8 }));
    expect(await svc.modeleActif()).toBeNull();
    const a = await lancerEtAttendre();
    const b = await lancerEtAttendre();
    await svc.activer(a.modele!.id);
    expect(await svc.modeleActif()).toMatchObject({ id: a.modele!.id, nom: "Modele n°1", poids: { version: 1 } });
    await svc.activer(b.modele!.id);
    expect((await svc.modeleActif())!.id).toBe(b.modele!.id);
    expect((await svc.listeModeles()).filter((m) => m.actif).map((m) => m.id)).toEqual([b.modele!.id]);
    await svc.desactiver();
    expect(await svc.modeleActif()).toBeNull();
    await expect(svc.activer("inconnu")).rejects.toThrow(NotFoundException);
  });

  it("suppression : refusee pour le modele actif, sinon l'entrainement garde son resultat", async () => {
    await insererLigue(ds, ligue({ clubs: 4, semaines: 8 }));
    const e = await lancerEtAttendre();
    await svc.activer(e.modele!.id);
    await expect(svc.supprimerModele(e.modele!.id)).rejects.toThrow(ConflictException);
    await svc.desactiver();
    await svc.supprimerModele(e.modele!.id);
    expect(await svc.listeModeles()).toEqual([]);
    const apres = await svc.detail(e.id);
    expect(apres).toMatchObject({ statut: "termine", modele: null, modeleId: null });
    expect(apres.resultat).not.toBeNull();
    await expect(svc.supprimerModele(e.modele!.id)).rejects.toThrow(NotFoundException);
  });

  it("etat : donnees disponibles par saison, modele actif, entrainement en cours et dernier entrainement", async () => {
    await insererLigue(ds, ligue({ clubs: 4, semaines: 8 }));
    const vide = await svc.etat();
    expect(vide).toMatchObject({ actif: null, enCours: null, dernier: null, donnees: { matchsJoues: 16, saisons: [{ id: "s25", nom: "2025-2026", matchs: 16 }] } });

    const lance = await svc.lancer("admin-1", { optimiser: false });
    expect((await svc.etat()).enCours).toMatchObject({ id: lance.id, statut: "en_cours" });
    await svc.attendre(lance.id);
    const fin = await svc.etat();
    expect(fin.enCours).toBeNull();
    expect(fin.dernier).toMatchObject({ id: lance.id, statut: "termine", modele: { actif: false } });
    await svc.activer(fin.dernier!.modele!.id);
    expect((await svc.etat()).actif).toMatchObject({ nom: "Modele n°1", actif: true });
  });

  it("liste : les entrainements les plus recents d'abord, sans leur resultat detaille", async () => {
    await insererLigue(ds, ligue({ clubs: 4, semaines: 8 }));
    const un = await lancerEtAttendre();
    const deux = await lancerEtAttendre();
    const liste = await svc.liste();
    expect(liste.map((e) => e.id)).toEqual([deux.id, un.id]);
    expect(liste[0]).not.toHaveProperty("resultat");
    await expect(svc.detail("inconnu")).rejects.toThrow(NotFoundException);
    await expect(svc.resume("inconnu")).rejects.toThrow(NotFoundException);
    await expect(svc.annuler("inconnu")).rejects.toThrow(NotFoundException);
  });

  it("le dispositif saisi par le staff est appris (matchs de la base), pas le couple invente par l'ancien import", async () => {
    await insererLigue(ds, ligue({ clubs: 6, semaines: 14, formation: "4-3-3" }));
    const sain = await lancerEtAttendre();
    expect(sain.resultat!.systeme).not.toBeNull();
    expect(sain.modele!.resume.systemeAppris).toBe(true);

    const e = ligue({ clubs: 6, semaines: 14 });
    for (const m of e.matchs) { m.formationDom = "4-4-2"; m.formationExt = "4-2-3-1"; }
    const ds2 = await creerBaseTest();
    try {
      const svc2 = new IaService(
        ds2.getRepository(Match), ds2.getRepository(Equipe), ds2.getRepository(Club), ds2.getRepository(Composition),
        ds2.getRepository(Saison), ds2.getRepository(IaEntrainement), ds2.getRepository(IaModele),
      );
      await insererLigue(ds2, e);
      const lance = await svc2.lancer(null, { optimiser: false });
      await svc2.attendre(lance.id);
      const invente = await svc2.detail(lance.id);
      expect(invente.resultat!.systeme).toBeNull();
      expect(invente.modele!.resume.systemeAppris).toBe(false);
    } finally { await ds2.destroy(); }
  });
});
