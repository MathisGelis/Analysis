// Synchronisation du calendrier FFF d'une equipe, sur une vraie base (SQLite ou Postgres) : creation, rejeu, changement de la
// ligue, retouche manuelle, match disparu, adoption d'un match programme a la main, match deja joue, refus.

import { IsNull, Not } from "typeorm";

import { JournalAudit } from "@/features/audit/journal-audit.entity";
import { CalendrierFffService } from "@/features/calendrier-fff/calendrier-fff.service";
import { Club } from "@/features/clubs/club.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Match } from "@/features/matchs/match.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";
import { construireIcs, EvenementFff, saisonFictive } from "@test/support/calendrier-fff";

/** Le 13/11/2026 : J1 (7/11) est passee, J2 a J6 sont a venir. */
const MAINT = new Date("2026-11-13T12:00:00Z");
const LENDEMAIN = new Date("2026-11-14T12:00:00Z");
const evenements = (): EvenementFff[] => saisonFictive("2026-11-07");

describe("synchronisation du calendrier FFF", () => {
  let t: AppTest;
  let m: Monde;
  let svc: CalendrierFffService;
  beforeEach(async () => { t = await creerAppTest(); m = await creerMonde(t); svc = t.app.get(CalendrierFffService); });
  afterEach(() => t.fermer());

  const equipe = () => t.ds.getRepository(Equipe).findOneByOrFail({ id: m.sen26.id });
  const sync = async (ics: string, maintenant = MAINT) => svc.synchroniser(await equipe(), ics, "fichier", { id: "compte-1", role: "referent", clubId: m.ol.id }, maintenant);
  const duCalendrier = () => t.ds.getRepository(Match).find({ where: { idFff: Not(IsNull()) }, order: { date: "ASC" } });

  it("cree les matchs a venir (prevus, rattaches a l'equipe), pas les matchs deja passes ; les adversaires inconnus deviennent des clubs", async () => {
    const r = await sync(construireIcs(evenements()));
    expect(r).toMatchObject({ source: "fichier", total: 6, passes: 1, inchanges: 0, dejaJoues: 0, disparus: [], modifies: [], avertissements: [] });
    expect(r.crees.map((c) => c.journee)).toEqual(["2", "3", "4", "5", "6"]);

    const matchs = await duCalendrier();
    expect(matchs).toHaveLength(5);
    const clubs = new Map((await t.ds.getRepository(Club).find()).map((c) => [c.nom, c.id]));
    expect([...clubs.keys()]).toEqual(expect.arrayContaining(["Football Club de la Plaine", "Racing Club du Marais", "Union Sportive de la Riviere"]));

    // J2 : exterieur chez le Football Club de la Plaine ; J3 : domicile.
    expect(matchs[0]).toMatchObject({
      idFff: "55680002", journee: "2", date: "2026-11-14", heure: "19:00", terrain: "STADE ADVERSE", statut: "prevu", scoreDom: 0, scoreExt: 0,
      clubDom: clubs.get("Football Club de la Plaine"), clubExt: m.ol.id, equipeExtId: m.sen26.id, equipeDomId: null,
      competition: "Seniors D2 / Phase Unique", poule: "A", saisonId: m.s26.id, calendrierDisparu: false,
    });
    expect(matchs[1]).toMatchObject({ idFff: "55680003", clubDom: m.ol.id, equipeDomId: m.sen26.id, equipeExtId: null, terrain: "STADE DE LA PLAINE 1" });
    expect((await equipe()).calendrierSynchroLe).toBe(MAINT.toISOString());
  });

  it("rejouer le meme calendrier ne change rien : ni doublon, ni club en plus", async () => {
    await sync(construireIcs(evenements()));
    const clubsAvant = await t.ds.getRepository(Club).count();
    const r = await sync(construireIcs(evenements()), LENDEMAIN);
    expect(r).toMatchObject({ crees: [], modifies: [], disparus: [], inchanges: 5, passes: 1 });
    expect(await duCalendrier()).toHaveLength(5);
    expect(await t.ds.getRepository(Club).count()).toBe(clubsAvant);
  });

  it("la ligue decale un match : il est mis a jour et signale ; une retouche manuelle tient tant que la ligue ne le change pas", async () => {
    await sync(construireIcs(evenements()));
    // Retouche manuelle du lieu de J4 : le calendrier (inchange) ne l'ecrase pas.
    await t.ds.getRepository(Match).update({ idFff: "55680004" }, { terrain: "Terrain annexe" });
    expect((await sync(construireIcs(evenements()), LENDEMAIN)).inchanges).toBe(5);
    expect((await t.ds.getRepository(Match).findOneByOrFail({ idFff: "55680004" })).terrain).toBe("Terrain annexe");

    // La ligue decale J3 (nouveau DTSTAMP) : date, heure et lieu changent.
    const decale = evenements().map((e) => (e.journee === 3 ? { ...e, date: "2026-11-22", heure: "17:00", lieu: "STADE NEUTRE", stamp: "20261114T180000Z" } : e));
    const r = await sync(construireIcs(decale), new Date("2026-11-15T12:00:00Z"));
    expect(r.modifies).toEqual([expect.objectContaining({ journee: "3", avant: "21/11 15:00 ; STADE DE LA PLAINE 1", apres: "22/11 17:00 ; STADE NEUTRE" })]);
    expect(r.inchanges).toBe(4);
    expect(await t.ds.getRepository(Match).findOneByOrFail({ idFff: "55680003" })).toMatchObject({ date: "2026-11-22", heure: "17:00", terrain: "STADE NEUTRE" });
  });

  it("un match programme qui disparait du calendrier est signale (jamais supprime) ; s'il revient, le signalement tombe", async () => {
    await sync(construireIcs(evenements()));
    const sans5 = evenements().filter((e) => e.journee !== 5);
    const r = await sync(construireIcs(sans5), LENDEMAIN);
    expect(r.disparus).toEqual([expect.objectContaining({ journee: "5", date: "2026-12-05" })]);
    expect(await t.ds.getRepository(Match).findOneByOrFail({ idFff: "55680005" })).toMatchObject({ calendrierDisparu: true, statut: "prevu" });
    // Deja signale : pas de nouveau signalement.
    expect((await sync(construireIcs(sans5), new Date("2026-11-15T12:00:00Z"))).disparus).toEqual([]);

    const r3 = await sync(construireIcs(evenements()), new Date("2026-11-16T12:00:00Z"));
    expect(r3.reapparus).toBe(1);
    expect(await t.ds.getRepository(Match).findOneByOrFail({ idFff: "55680005" })).toMatchObject({ calendrierDisparu: false });
  });

  it("un match deja programme a la main (meme sens, quelques jours d'ecart) est repris, pas double", async () => {
    const plaine = await t.f.club("Football Club de la Plaine");
    const manuel = await t.f.match({
      clubDom: plaine.id, clubExt: m.ol.id, equipeExtId: m.sen26.id, saisonId: m.s26.id, date: "2026-11-16", heure: "15:00", statut: "prevu",
    } as any);
    const r = await sync(construireIcs(evenements()));
    expect(r.crees.map((c) => c.journee)).toEqual(["3", "4", "5", "6"]);
    // Le match saisi a la main n'avait ni lieu ni journee : la FFF les renseigne.
    expect(r.modifies).toEqual([expect.objectContaining({
      journee: "2", avant: "16/11 15:00 ; lieu non renseigne ; journee ?", apres: "14/11 19:00 ; STADE ADVERSE ; journee 2",
    })]);
    const repris = await t.ds.getRepository(Match).findOneByOrFail({ id: manuel.id });
    expect(repris).toMatchObject({ idFff: "55680002", date: "2026-11-14", heure: "19:00" });
    expect(await t.ds.getRepository(Match).count({ where: { clubDom: plaine.id, clubExt: m.ol.id } })).toBe(1);
  });

  it("un match qui a deja sa feuille ou son score n'est jamais modifie (meme jour, meme sens)", async () => {
    // Le monde a un match joue OL - Mions le 04/10/2026 (2-1) : le calendrier le contient, sous un autre titre.
    const avecMions: EvenementFff[] = [
      { id: "55679999", journee: 0, domicile: true, adversaire: "MIONS 2", adversaireSlug: "mions", date: "2026-10-04", heure: "15:00" },
      ...evenements(),
    ];
    const r = await sync(construireIcs(avecMions));
    expect(r.dejaJoues).toBe(1);
    expect(r.crees).toHaveLength(5);
    expect(await t.ds.getRepository(Match).findOneByOrFail({ id: m.m26.id })).toMatchObject({
      statut: "joue", scoreDom: 2, scoreExt: 1, date: "2026-10-04", idFff: "55679999",
    });
    // Le match U20 du meme club contre le meme adversaire (le 11/10) est celui d'une autre equipe : jamais repris.
    expect(await t.ds.getRepository(Match).findOneByOrFail({ id: m.mU20.id })).toMatchObject({ idFff: null, date: "2026-10-11", statut: "prevu" });
  });

  it("refus : mauvaise saison, autre equipe que celle deja synchronisee, fichier illisible ; rien n'est ecrit", async () => {
    await expect(sync(construireIcs(evenements(), { saison: "2025/2026" }))).rejects.toThrow(/saison 2025\/2026.*2026-2027/);
    expect(await duCalendrier()).toHaveLength(0);

    await sync(construireIcs(evenements()));
    const autre = evenements().map((e) => ({ ...e, id: String(Number(e.id) + 100) }));
    await expect(sync(construireIcs(autre), LENDEMAIN)).rejects.toThrow(/aucun match en commun/);
    expect(await duCalendrier()).toHaveLength(5);
    expect((await t.ds.getRepository(Match).find({ where: { calendrierDisparu: true } }))).toHaveLength(0);

    for (const texte of ["", "pas un calendrier", construireIcs([])]) await expect(sync(texte)).rejects.toThrow(/Aucun match lisible/);
  });

  it("avertit quand le calendrier est celui d'un autre club ; la synchronisation est tracee au journal d'audit, sans nom", async () => {
    const r = await sync(construireIcs(evenements(), { nom: "US AUTRE CLUB" }));
    expect(r.avertissements[0]).toContain("US AUTRE CLUB");

    const traces = await t.ds.getRepository(JournalAudit).find({ where: { action: "calendrier.synchronisation" } });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ utilisateurId: "compte-1", cible: `equipe:${m.sen26.id}`, cibleClubId: m.ol.id });
    expect(traces[0].details).toEqual({ source: "fichier", total: 6, crees: 5, modifies: 0, disparus: 0, passes: 1 });
  });
});
