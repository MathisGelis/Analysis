import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { Club } from "@/features/clubs/club.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { Tactique } from "@/features/tactiques/tactique.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { ArbitresService } from "@/features/arbitres/arbitres.service";
import { ClubsService } from "@/features/clubs/clubs.service";
import { CoachsService } from "@/features/coachs/coachs.service";
import { EquipesService } from "@/features/equipes/equipes.service";
import { MatchsService } from "@/features/matchs/matchs.service";
import { SaisonsService } from "@/features/saisons/saisons.service";
import { FmiService } from "@/features/fmi/fmi.service";
// Sortie reelle du parser Python sur parser/FMI_Neuville1.pdf.
import neuville from "@test/support/fixtures/fmi-neuville1.parsed.json";

describe("FmiService - import de lot", () => {
  let ds: DataSource;
  let svc: FmiService;
  let equipes: EquipesService;
  let rebuildAll: jest.Mock;
  let f: ReturnType<typeof fabriques>;

  /** Copie profonde de la feuille de reference, avec surcharges. */
  const fmi = (surcharge: Record<string, any> = {}) => ({
    ...JSON.parse(JSON.stringify(neuville)), ...surcharge,
  });
  const lot = (...entrees: { originalname: string; parsed: any; error?: string }[]) =>
    jest.spyOn(svc, "parseBuffersBatch").mockResolvedValue(entrees);
  const fichiers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ buffer: Buffer.from("x"), originalname: `f${i}.pdf` }));

  beforeEach(async () => {
    ds = await creerBaseTest();
    f = fabriques(ds);
    const repo = <T extends object>(e: new () => T) => ds.getRepository(e);
    equipes = new EquipesService(repo(Equipe));
    rebuildAll = jest.fn().mockResolvedValue({ joueurs: 12, classement: 3 });
    svc = new FmiService(
      new ConfigService(),
      new MatchsService(repo(Match), repo(Composition), repo(EvenementMatch)),
      new ClubsService(repo(Club)),
      { rebuildAll } as any,
      new ArbitresService(repo(Arbitre), repo(ArbitreMatch)),
      new CoachsService(repo(Coach), repo(StaffMatch)),
      equipes,
      new SaisonsService(repo(Saison), equipes),
    );
  });
  afterEach(() => { jest.restoreAllMocks(); return ds.destroy(); });

  it("importe une feuille : match, equipes, saison, arbitres et encadrement", async () => {
    lot({ originalname: "a.pdf", parsed: fmi() });

    const r = await svc.importMany(fichiers(1));

    expect(r).toMatchObject({ ok: true, importes: 1, nouveaux: 1, mis_a_jour: 0, echecs: 0, total: 1 });
    expect(r.resultats[0]).toMatchObject({
      fichier: "a.pdf", ok: true, statut: "importe", numeroFmi: "53415223",
      resume: { score: "2-0", titulaires: 22 }, avertissements: [],
    });
    const match = await ds.getRepository(Match).findOneByOrFail({ numeroFmi: "53415223" });
    // Regression : les equipes doivent etre rattachees au match (cette etape
    // echouait en silence avant la correction de la requete d'orpheline).
    expect(match.equipeDomId).toBeTruthy();
    expect(match.equipeExtId).toBeTruthy();
    expect(match.saisonId).toBeTruthy();
    expect((await ds.getRepository(Saison).findOneByOrFail({ id: match.saisonId })).nom).toBe("2025-2026");
    expect(await ds.getRepository(ArbitreMatch).count()).toBe(3);
    expect(await ds.getRepository(StaffMatch).count()).toBe(4);
    expect(rebuildAll).toHaveBeenCalledTimes(1);
  });

  it("cartons verts (fair-play) : enregistres a part, jamais parmi les sanctions", async () => {
    const parsed = fmi({
      cartons_verts: [
        { equipe: "Neuville S/S 2", licence: "2538644299", joueur: "MANSOUR Abdamalek", numero: 4, motif: "", couleur: "vert", minute: 34, arret: 0 },
      ],
    });
    lot({ originalname: "a.pdf", parsed });

    await svc.importMany(fichiers(1));

    const evts = await ds.getRepository(EvenementMatch).find();
    expect(evts.filter((e) => e.type === "carton")).toHaveLength(6);       // les 6 sanctions de la feuille, pas une de plus
    const vert = evts.filter((e) => e.type === "carton_vert");
    expect(vert).toHaveLength(1);
    expect(vert[0]).toMatchObject({ sousType: "vert", joueur: "MANSOUR Abdamalek", minute: 34 });
  });

  it("n'invente aucune formation et ne reecrase pas celle saisie a la main", async () => {
    lot({ originalname: "a.pdf", parsed: fmi() });
    await svc.importMany(fichiers(1));
    const repo = ds.getRepository(Match);
    const cree = await repo.findOneByOrFail({ numeroFmi: "53415223" });
    expect(cree.formationDom).toBeNull();
    expect(cree.formationExt).toBeNull();

    await repo.update(cree.id, { formationDom: "3-5-2" });
    await svc.importMany(fichiers(1));

    const apres = await repo.findOneByOrFail({ numeroFmi: "53415223" });
    expect(apres.formationDom).toBe("3-5-2");
    expect(apres.formationExt).toBeNull();
  });

  it("reimport de la meme feuille : mise a jour, jamais de doublon", async () => {
    lot({ originalname: "a.pdf", parsed: fmi() });
    await svc.importMany(fichiers(1));

    const r = await svc.importMany(fichiers(1));

    expect(r).toMatchObject({ importes: 1, nouveaux: 0, mis_a_jour: 1, echecs: 0 });
    expect(r.resultats[0]).toMatchObject({ statut: "mis_a_jour", reimport: true });
    expect(await ds.getRepository(Match).count()).toBe(1);
    expect(await ds.getRepository(ArbitreMatch).count()).toBe(3);
    expect(await ds.getRepository(StaffMatch).count()).toBe(4);
  });

  describe("match deja programme", () => {
    /** Importe la feuille une fois pour creer les clubs, puis la remplace par un match "prevu". */
    async function programmer(date: string) {
      lot({ originalname: "a.pdf", parsed: fmi() });
      await svc.importMany(fichiers(1));
      const repo = ds.getRepository(Match);
      const joue = await repo.findOneByOrFail({ numeroFmi: "53415223" });
      await repo.delete(joue.id);
      const prevu = await f.match({
        clubDom: joue.clubDom, clubExt: joue.clubExt, equipeDomId: joue.equipeDomId, equipeExtId: joue.equipeExtId,
        saisonId: joue.saisonId, date, statut: "prevu", scoreDom: 0, scoreExt: 0, arbitre: "Dupont Jean", terrain: "Stade prevu",
      });
      return { prevu, joue };
    }

    it("la feuille complete le match programme : meme id, donc le plan de jeu reste rattache", async () => {
      const { prevu, joue } = await programmer("25/01/2026");
      const plan = await ds.getRepository(Tactique).save(ds.getRepository(Tactique).create({
        equipeId: joue.equipeDomId, matchId: prevu.id, formation: "4-4-2", titulaires: [], remplacants: [],
      }));

      const r = await svc.importMany(fichiers(1));

      expect(r).toMatchObject({ importes: 1, echecs: 0 });
      const matchs = await ds.getRepository(Match).find();
      expect(matchs).toHaveLength(1);
      expect(matchs[0]).toMatchObject({ id: prevu.id, numeroFmi: "53415223", statut: "joue", scoreDom: 2, scoreExt: 0 });
      expect(await ds.getRepository(Composition).count({ where: { matchId: prevu.id } })).toBeGreaterThan(0);
      expect((await ds.getRepository(Tactique).findOneByOrFail({ id: plan.id })).matchId).toBe(prevu.id);
    });

    it("l'arbitre et le terrain saisis a la main restent si la feuille n'en donne pas", async () => {
      const { prevu } = await programmer("25/01/2026");
      lot({ originalname: "a.pdf", parsed: fmi({ terrain: null, officiels: [] }) });

      await svc.importMany(fichiers(1));

      const apres = await ds.getRepository(Match).findOneByOrFail({ id: prevu.id });
      expect(apres).toMatchObject({ arbitre: "Dupont Jean", terrain: "Stade prevu" });
    });

    it("un match programme a une autre date (autre rencontre du duel) n'est pas touche", async () => {
      const { prevu } = await programmer("20/09/2026");

      await svc.importMany(fichiers(1));

      const matchs = await ds.getRepository(Match).find();
      expect(matchs).toHaveLength(2);
      expect(matchs.find((m) => m.id === prevu.id)).toMatchObject({ statut: "prevu", numeroFmi: null });
    });
  });

  it("doublon DANS le lot : signale sur le second fichier", async () => {
    lot({ originalname: "a.pdf", parsed: fmi() }, { originalname: "copie.pdf", parsed: fmi() });

    const r = await svc.importMany(fichiers(2));

    expect(r.resultats[0].avertissements).toEqual([]);
    expect(r.resultats[1]).toMatchObject({ statut: "mis_a_jour" });
    expect(r.resultats[1].avertissements[0]).toMatch(/doublon dans le lot.*a\.pdf|a\.pdf.*doublon dans le lot/);
    expect(r.avec_avertissements).toBe(1);
    expect(await ds.getRepository(Match).count()).toBe(1);
  });

  it("un fichier defaillant n'empeche pas les autres, et chaque echec a son code", async () => {
    lot(
      { originalname: "ok.pdf", parsed: fmi() },
      { originalname: "illisible.pdf", parsed: null, error: "Parser n'a pas produit de JSON pour ce fichier" },
      { originalname: "sans-score.pdf", parsed: fmi({ numero_match: "1", score_recevant: null }) },
    );

    const r = await svc.importMany(fichiers(3));

    expect(r).toMatchObject({ ok: false, importes: 1, echecs: 2, total: 3 });
    expect(r.resultats.map((x) => x.statut)).toEqual(["importe", "echec", "echec"]);
    expect(r.resultats[1]).toMatchObject({ code: "parse_impossible", erreur: expect.stringMatching(/JSON/) });
    expect(r.resultats[2]).toMatchObject({ code: "fmi_invalide", erreur: expect.stringMatching(/score manquant/) });
    expect(await ds.getRepository(Match).count()).toBe(1);
  });

  it("l'echec de la reconstruction n'annule pas le rapport", async () => {
    rebuildAll.mockRejectedValue(new Error("base verrouillee"));
    lot({ originalname: "a.pdf", parsed: fmi() });

    const r = await svc.importMany(fichiers(1));

    expect(r.ok).toBe(false);
    expect(r.derive).toEqual({ erreur: "base verrouillee" });
    expect(r.importes).toBe(1);
    expect(await ds.getRepository(Match).count()).toBe(1);
  });

  it("feuille sans aucun encadrement lu : importee, avec un avertissement pour la reimporter apres correction", async () => {
    lot({ originalname: "a.pdf", parsed: fmi({ encadrement: [] }) });

    const r = await svc.importMany(fichiers(1));

    expect(r.resultats[0]).toMatchObject({ ok: true, statut: "importe" });
    expect(r.resultats[0].avertissements).toContain("aucun encadrement (entraineur, dirigeant) lu sur la feuille");
    expect(await ds.getRepository(StaffMatch).count()).toBe(0);
  });

  it("compositions incompletes : importe avec un avertissement", async () => {
    lot({ originalname: "a.pdf", parsed: fmi({ compo_recevante: [], compo_visiteuse: [] }) });

    const r = await svc.importMany(fichiers(1));

    expect(r.resultats[0]).toMatchObject({ ok: true, statut: "importe" });
    expect(r.resultats[0].avertissements[0]).toMatch(/compositions incompletes/);
  });

  it("equipe clonee orpheline de meme categorie : reutilisee, pas de doublon ni d'avertissement", async () => {
    const club = await f.club("Neuville S/S", { numeroFff: "504275" });
    const s25 = await f.saison("2025-2026", 2025);
    await f.equipe({
      clubId: club.id, nom: "Seniors D3 Poule A", categorie: "Seniors", division: "D3",
      poule: "A", competitionLibelle: "Seniors D3 / Phase Unique", saisonId: s25.id,
    });
    lot({ originalname: "a.pdf", parsed: fmi() });

    const r = await svc.importMany(fichiers(1));

    expect(r.resultats[0].avertissements).toEqual([]);
    const equipesClub = await equipes.findAll({ clubId: club.id });
    expect(equipesClub).toHaveLength(1);
    expect(equipesClub[0]).toMatchObject({ division: "D2", poule: "C", competitionLibelle: "Seniors D2 / Phase Unique" });
    const match = await ds.getRepository(Match).findOneByOrFail({ numeroFmi: "53415223" });
    expect(match.equipeDomId).toBe(equipesClub[0].id);
  });

  it("si le rattachement des equipes echoue, l'import continue et l'avertit explicitement", async () => {
    jest.spyOn(equipes, "upsertForFmi").mockRejectedValue(new Error("no such column"));
    lot({ originalname: "a.pdf", parsed: fmi() });

    const r = await svc.importMany(fichiers(1));

    expect(r.resultats[0]).toMatchObject({ ok: true, statut: "importe" });
    expect(r.resultats[0].avertissements[0]).toMatch(/equipes non rattachees \(no such column\)/);
    const match = await ds.getRepository(Match).findOneByOrFail({ numeroFmi: "53415223" });
    expect(match.equipeDomId).toBeNull();
  });

  it("levee de BadRequestException depuis le parseur : erreur globale conservee", async () => {
    jest.spyOn(svc, "parseBuffersBatch").mockRejectedValue(new BadRequestException("Python absent"));
    await expect(svc.importMany(fichiers(1))).rejects.toBeInstanceOf(BadRequestException);
  });
});
