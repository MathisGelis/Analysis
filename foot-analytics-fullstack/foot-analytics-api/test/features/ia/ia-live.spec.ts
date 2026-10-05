import { DataSource } from "typeorm";

import { AnalyseService } from "@/features/analyse/analyse.service";
import { Club } from "@/features/clubs/club.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { IaEntrainement } from "@/features/ia/ia-entrainement.entity";
import { IaModele } from "@/features/ia/ia-modele.entity";
import { IaService } from "@/features/ia/ia.service";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { avecAvisDuModele, compoProbableDuModele, feuillesDeLEquipe, MatchDeLEquipe, systemeDuModele } from "@/features/ia/ia-live";
import { construireJeuDonnees } from "@/features/ia/ia-donnees";
import { entrainer } from "@/features/ia/ia-entrainement";
import { HYPER_PAR_DEFAUT, poidsInitiaux } from "@/features/ia/ia-modele";
import { SituationService } from "@/features/analyse/situation.service";
import { fusionnerSystemes, SystemeProbable } from "@/features/analyse/systeme-probable";
import { analyserNumeros, lignesDeFeuille } from "@/features/analyse/compo-numeros";
import { creerBaseTest } from "@test/support/test-db";
import { creerIaService, insererLigue, ligue } from "./ligue";

/** Les matchs d'un club de la ligue synthetique, au format du rapport d'equipe. */
function matchsDuClub(club: number, semaines = 8, formation: string | null = null): MatchDeLEquipe[] {
  const e = ligue({ clubs: 4, semaines, formation });
  return e.matchs.filter((m) => m.clubDom === `c${club}` || m.clubExt === `c${club}`).map((m) => {
    const cote = m.clubDom === `c${club}` ? "dom" : "ext";
    const lignes = e.compos.filter((c) => c.matchId === m.id && c.cote === cote);
    return { m: { id: m.id, date: m.date, journee: m.journee, saisonId: m.saisonId, formationDom: m.formationDom, formationExt: m.formationExt }, dom: cote === "dom", titulaires: lignes.filter((l) => l.titulaire), bancs: lignes.filter((l) => !l.titulaire) };
  });
}

describe("feuillesDeLEquipe", () => {
  it("de la plus ancienne a la plus recente, quel que soit l'ordre d'arrivee ; sans onze : ignoree", () => {
    const matchs = matchsDuClub(0);
    const melange = [...matchs].reverse();
    melange[2] = { ...melange[2], titulaires: [] };                      // une feuille sans onze
    const feuilles = feuillesDeLEquipe(melange);
    expect(feuilles).toHaveLength(matchs.length - 1);
    expect(feuilles.map((f) => f.temps)).toEqual([...feuilles.map((f) => f.temps)].sort((a, b) => a - b));
    expect(feuilles[0].lignes.filter((l) => l.titulaire)).toHaveLength(11);
    expect(feuilles[0].lignes.find((l) => l.titulaire)!.minutes).toBe(90);
  });
});

describe("compoProbableDuModele", () => {
  it("11 titulaires avec leur numero et leur probabilite, la confiance et le nombre de feuilles lues", () => {
    const matchs = matchsDuClub(0);
    const c = compoProbableDuModele(poidsInitiaux(), matchs, "s25")!;
    expect(c.titulaires).toHaveLength(11);
    expect(c.titulaires.map((t) => t.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(c.titulaires.every((t) => t.proba > 0 && t.proba <= 1 && t.titularisations > 0)).toBe(true);
    expect(c.sur).toBe(Math.min(matchs.length, poidsInitiaux().hyper.fenetre));
    expect(c.confiance).toBeGreaterThan(0.5);
  });

  it("aucun match avec onze : rien a predire", () => {
    expect(compoProbableDuModele(poidsInitiaux(), [], "s25")).toBeNull();
    expect(compoProbableDuModele(poidsInitiaux(), matchsDuClub(0).map((m) => ({ ...m, titulaires: [] })), "s25")).toBeNull();
  });
});

describe("le dispositif en direct", () => {
  const apprendre = (formation: string | null) =>
    entrainer(construireJeuDonnees(ligue({ clubs: 6, semaines: 14, formation })), { grille: [HYPER_PAR_DEFAUT] });

  it("les feuilles portent le dispositif saisi par le staff pour l'equipe (jamais le couple invente)", () => {
    const saisi = feuillesDeLEquipe(matchsDuClub(0, 8, "4-3-3"));
    expect(saisi.every((f) => f.formation === "4-3-3")).toBe(true);
    expect(feuillesDeLEquipe(matchsDuClub(0, 8)).every((f) => f.formation === null)).toBe(true);
    const invente = matchsDuClub(0, 8).map((m) => ({ ...m, m: { ...m.m, formationDom: "4-4-2", formationExt: "4-2-3-1" } }));
    expect(feuillesDeLEquipe(invente).every((f) => f.formation === null)).toBe(true);
  });

  it("un modele qui a appris les dispositifs (et fait au moins aussi bien que les regles) choisit le dispositif", async () => {
    const r = await apprendre("4-3-3");
    expect(r.poids.systemeRetenu).toBe(true);
    const direct = systemeDuModele(r.poids, matchsDuClub(0, 8, "4-3-3"))!;
    expect(direct.systeme).toBe("4-3-3");
    expect(direct.proba).toBeGreaterThan(0.5);
    expect(direct.classement[0]).toMatchObject({ systeme: "4-3-3" });
    expect(direct.classement.length).toBeLessThanOrEqual(4);
  });

  it("pas de modele de dispositif, ou non retenu, ou aucune feuille : le moteur a regles garde la main", async () => {
    const r = await apprendre(null);
    expect(r.poids.systeme).toBeNull();
    expect(systemeDuModele(r.poids, matchsDuClub(0, 8))).toBeNull();
    const appris = await apprendre("4-3-3");
    expect(systemeDuModele({ ...appris.poids, systemeRetenu: false }, matchsDuClub(0, 8, "4-3-3"))).toBeNull();
    const { systemeRetenu, ...ancien } = appris.poids;                    // modele d'avant la verification : non verifie, donc non retenu
    expect(systemeRetenu).toBe(true);
    expect(systemeDuModele(ancien, matchsDuClub(0, 8, "4-3-3"))).toBeNull();
    expect(systemeDuModele(appris.poids, [])).toBeNull();
  });

  it("l'avis du modele : il choisit le dispositif et sa probabilite, la preuve (source, observations) reste celle des donnees", async () => {
    const appris = await apprendre("4-3-3");
    const matchs = matchsDuClub(0, 8, "4-3-3");
    const modele = systemeDuModele(appris.poids, matchs)!;
    const base: SystemeProbable = fusionnerSystemes(
      { systeme: "4-4-2", confiance: 70, observations: 4, fiabilite: "moyenne", alternatives: [{ systeme: "4-3-3", poids: 30 }] },
      analyserNumeros(matchs.flatMap((i) => lignesDeFeuille(i.m, [...i.titulaires, ...i.bancs]))),
    )!;
    const avec = avecAvisDuModele(base, modele, "Modele n°3")!;
    expect(avec.systeme).toBe("4-3-3");
    expect(avec.confiance).toBe(Math.round(modele.proba * 100));
    expect(avec.modele).toEqual({ nom: "Modele n°3" });
    expect(avec.indices[0]).toMatch(/Choisi par le modele Modele n°3 : 4-3-3/);
    expect(avec.indices.slice(1)).toEqual(base.indices);
    expect(avec).toMatchObject({ source: base.source, observations: 4, fiabilite: base.fiabilite });
    expect(avec.disposition).toBeDefined();
    expect(avec.alternatives.every((a) => a.poids > 0)).toBe(true);
    // Sans preuve (aucun dispositif saisi, numeros illisibles) : pas de systeme, le modele ne devine pas ; sans avis : la base telle quelle.
    expect(avecAvisDuModele(null, modele, "Modele n°3")).toBeNull();
    expect(avecAvisDuModele(base, null, "Modele n°3")).toBe(base);
  });
});

describe("le dispositif du modele dans les services", () => {
  let ds: DataSource;
  let ia: IaService;

  beforeEach(async () => {
    ds = await creerBaseTest();
    ia = creerIaService(ds);
  });
  afterEach(() => ds.destroy());

  const situation = (avecIa: boolean) => new SituationService(
    ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Composition), ds.getRepository(Joueur), avecIa ? ia : undefined,
  );
  const entrainerEtActiver = async () => {
    const lance = await ia.lancer(null, { optimiser: false });
    await ia.attendre(lance.id);
    await ia.activer((await ia.resume(lance.id)).modele!.id);
  };

  it("fiche club : avec un modele actif qui a appris les dispositifs, le dispositif probable vient du modele ; sinon des regles", async () => {
    await insererLigue(ds, ligue({ clubs: 6, semaines: 14, formation: "4-3-3" }));
    const avant = (await situation(true).situation("c0", { saisonId: "s25" })).systeme.probable!;
    expect(avant).toMatchObject({ systeme: "4-3-3" });
    expect(avant.modele).toBeUndefined();

    await entrainerEtActiver();
    const apres = (await situation(true).situation("c0", { saisonId: "s25" })).systeme.probable!;
    expect(apres).toMatchObject({ systeme: "4-3-3", modele: { nom: "Modele n°1" }, source: avant.source, observations: avant.observations });
    expect(apres.indices[0]).toMatch(/Choisi par le modele Modele n°1/);
    // Le service sans IA, ou le modele desactive : comme avant.
    expect((await situation(false).situation("c0", { saisonId: "s25" })).systeme.probable!.modele).toBeUndefined();
    await ia.desactiver();
    expect((await situation(true).situation("c0", { saisonId: "s25" })).systeme.probable!.modele).toBeUndefined();
  });

  it("aucun dispositif saisi : le modele n'a rien appris, et ne devine pas ; les numeros seuls parlent comme avant", async () => {
    await insererLigue(ds, ligue({ clubs: 6, semaines: 14 }));
    await entrainerEtActiver();
    const probable = (await situation(true).situation("c0", { saisonId: "s25" })).systeme.probable;
    expect(probable?.modele).toBeUndefined();
    expect(probable?.source ?? "numeros").toBe("numeros");
  });

  it("rapport d'equipe : le dispositif du modele est expose pour le pre-match", async () => {
    await insererLigue(ds, ligue({ clubs: 6, semaines: 14, formation: "4-3-3" }));
    await entrainerEtActiver();
    const repos = [
      ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Joueur), ds.getRepository(Composition), ds.getRepository(EvenementMatch),
      ds.getRepository(Entrainement), ds.getRepository(Coach), ds.getRepository(StaffMatch), ds.getRepository(Equipe),
      ds.getRepository(LigneClassement), ds.getRepository(Saison),
    ] as const;
    const r = await new AnalyseService(...repos, ia).rapportClub("c0");
    expect(r.systemeModele).toMatchObject({ nom: "Modele n°1", systeme: "4-3-3" });
    expect((await new AnalyseService(...repos).rapportClub("c0")).systemeModele).toBeNull();
  });
});

describe("AnalyseService.rapportClub avec le modele de l'IA", () => {
  let ds: DataSource;
  let ia: IaService;
  let avec: AnalyseService;
  let sans: AnalyseService;

  beforeEach(async () => {
    ds = await creerBaseTest();
    ia = creerIaService(ds);
    const repos = [
      ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Joueur), ds.getRepository(Composition), ds.getRepository(EvenementMatch),
      ds.getRepository(Entrainement), ds.getRepository(Coach), ds.getRepository(StaffMatch), ds.getRepository(Equipe),
      ds.getRepository(LigneClassement), ds.getRepository(Saison),
    ] as const;
    avec = new AnalyseService(...repos, ia);
    sans = new AnalyseService(...repos);
    await insererLigue(ds, ligue({ clubs: 4, semaines: 10 }));
  });
  afterEach(() => ds.destroy());

  it("sans modele actif : le moteur a regles, comme avant", async () => {
    const r = await avec.rapportClub("c0");
    expect(r.compoProbableSource).toBe("regles");
    expect(r.compoProbableModele).toBeNull();
    expect(r.compoProbable).toHaveLength(11);
    expect(r.compoProbable.every((j) => j.proba === undefined)).toBe(true);
  });

  it("avec un modele actif : la compo vient du modele, avec la probabilite de chaque joueur ; sans lui, retour aux regles", async () => {
    const lance = await ia.lancer(null, { optimiser: false });
    await ia.attendre(lance.id);
    const modele = (await ia.resume(lance.id)).modele!;
    await ia.activer(modele.id);

    const r = await avec.rapportClub("c0");
    expect(r.compoProbableSource).toBe("modele");
    expect(r.compoProbableModele).toBe("Modele n°1");
    expect(r.compoProbable).toHaveLength(11);
    expect(r.compoProbable.every((j) => typeof j.proba === "number" && j.proba > 0 && j.matchsJoues > 0)).toBe(true);
    expect(r.compoProbable.map((j) => j.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.compoProbable.map((j) => j.poste)).toEqual(["GB", "DD", "DG", "DCD", "DCG", "MDC", "AG", "MC", "BU", "MO", "AD"]);
    expect(r.compoProbableSur).toBe(10);

    // Le service sans IA (comme dans l'ancien code) et la desactivation reviennent au moteur a regles.
    expect((await sans.rapportClub("c0")).compoProbableSource).toBe("regles");
    await ia.desactiver();
    expect((await avec.rapportClub("c0")).compoProbableSource).toBe("regles");
  });
});
