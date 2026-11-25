import { DataSource } from "typeorm";

import { ClassementService } from "@/features/classement/classement.service";
import { Club } from "@/features/clubs/club.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { poidsInitiaux } from "@/features/ia/ia-modele";
import type { IaService } from "@/features/ia/ia.service";
import { creerBaseTest, fabriques } from "@test/support/test-db";

describe("ClassementService.predit", () => {
  let ds: DataSource;
  let f: ReturnType<typeof fabriques>;
  const creer = (ia?: Partial<IaService>) => new ClassementService(ds.getRepository(LigneClassement), ds.getRepository(Match), ds.getRepository(Equipe), ds.getRepository(Club), ia as IaService);

  beforeEach(async () => { ds = await creerBaseTest(); f = fabriques(ds); });
  afterEach(() => ds.destroy());

  async function championnat(noms: string[], poule = "A") {
    const s = await f.saison("2025-2026", 2025, { actif: true });
    const equipes: Equipe[] = [];
    const clubs: Club[] = [];
    for (const nom of noms) {
      const club = await f.club(nom);
      clubs.push(club);
      equipes.push(await f.equipe({ clubId: club.id, nom: "Seniors", categorie: "Seniors", saisonId: s.id, competitionLibelle: "D2", poule }));
    }
    const jouer = (i: number, j: number, sd: number, se: number, date: string, extra: object = {}) =>
      f.match({ clubDom: clubs[i].id, clubExt: clubs[j].id, equipeDomId: equipes[i].id, equipeExtId: equipes[j].id, saisonId: s.id, date, scoreDom: sd, scoreExt: se, competition: "D2", ...extra });
    return { s, equipes, clubs, jouer };
  }

  it("equipe inconnue : 404", async () => {
    await expect(creer().predit("nimporte")).rejects.toThrow(/introuvable/);
  });

  it("les matchs joues sont acquis, le reste de la double confrontation est simule, un match programme n'est pas un match joue", async () => {
    const c = await championnat(["Alpha", "Beta", "Gamma", "Delta"]);
    await c.jouer(0, 1, 3, 0, "06/09/2025");
    await c.jouer(1, 0, 0, 0, "07/12/2025", { statut: "a_venir" });          // programme : encore a jouer
    await c.jouer(2, 3, 1, 1, "06/09/2025");
    const r = (await creer().predit(c.equipes[0].id))!;
    expect(r.matchsJoues).toBe(2);
    expect(r.matchsRestants).toBe(10);
    expect(r.source).toBe("poisson");
    expect(r.modele).toBeNull();
    const alpha = r.equipes.find((e) => e.equipeId === c.equipes[0].id)!;
    expect(alpha.actuel).toMatchObject({ joues: 1, pts: 3, diff: 3 });
    expect(alpha.restants).toBe(5);
  });

  it("affiche le nom du club (pas celui de la poule), et l'equipe seulement quand un club en aligne plusieurs", async () => {
    const c = await championnat(["Alpha", "Beta", "Gamma"]);
    const r = (await creer().predit(c.equipes[0].id))!;
    expect(r.equipes.map((e) => e.nom).sort()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(r.equipes.some((e) => /Seniors/.test(e.nom))).toBe(false);

    await f.equipe({ clubId: c.clubs[0].id, nom: "Seniors B", categorie: "Seniors", saisonId: c.s.id, competitionLibelle: "D2", poule: "A" });
    const deux = (await creer().predit(c.equipes[0].id))!;
    expect(deux.equipes.filter((e) => e.clubId === c.clubs[0].id).map((e) => e.nom).sort()).toEqual(["Alpha (Seniors B)", "Alpha (Seniors)"]);
  });

  it("une coupe ne compte pas ; le score appris par l'IA n'est utilise que s'il est retenu", async () => {
    const c = await championnat(["Alpha", "Beta", "Gamma"]);
    await c.jouer(0, 1, 1, 0, "06/09/2025");
    await c.jouer(0, 2, 9, 0, "13/09/2025", { competition: "Coupe de France" });
    const sans = (await creer({ modeleActif: async () => ({ id: "m", nom: "Modele n°2", poids: { ...poidsInitiaux(), scoreRetenu: false } }) }).predit(c.equipes[0].id))!;
    expect(sans.matchsJoues).toBe(1);
    expect(sans.source).toBe("poisson");
    const avec = (await creer({ modeleActif: async () => ({ id: "m", nom: "Modele n°2", poids: { ...poidsInitiaux(), scoreRetenu: true } }) }).predit(c.equipes[0].id))!;
    expect(avec).toMatchObject({ source: "ia", modele: "Modele n°2" });
  });
});
