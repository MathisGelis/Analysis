import { DataSource } from "typeorm";

import { Club } from "@/features/clubs/club.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Match } from "@/features/matchs/match.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { SituationService } from "@/features/analyse/situation.service";

describe("SituationService.situation", () => {
  let ds: DataSource;
  let svc: SituationService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new SituationService(ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Composition), ds.getRepository(Joueur));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  async function contexte() {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const s = await f.saison("2025-2026", 2025, { actif: true });
    const seniors = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s.id });
    const u20 = await f.equipe({ clubId: moi.id, nom: "U20", categorie: "U20", saisonId: s.id });
    const advEq = await f.equipe({ clubId: adv.id, nom: "Adverse", categorie: "Seniors", saisonId: s.id });
    const jouer = (eq: { id: string }, date: string, extra: object = {}) => f.match({
      clubDom: moi.id, clubExt: adv.id, equipeDomId: eq.id, equipeExtId: advEq.id, saisonId: s.id, date, scoreDom: 2, scoreExt: 1, ...extra,
    });
    /** Onze + un remplacant entre + un remplacant reste sur le banc, cote domicile. */
    const feuille = async (matchId: string, prefixe: string) => {
      for (let n = 1; n <= 11; n++) await f.compo({ matchId, cote: "dom", numero: n, nom: `${prefixe}${n}`, prenom: "Jo", licence: n === 9 ? "LIC9" : undefined, capitaine: n === 4 });
      await f.compo({ matchId, cote: "dom", numero: 13, nom: `${prefixe}BANC`, titulaire: false, minutes: 0 });
      await f.compo({ matchId, cote: "dom", numero: 12, nom: `${prefixe}ENTRE`, titulaire: false, minutes: 25 });
    };
    return { moi, adv, s, seniors, u20, advEq, jouer, feuille };
  }

  it("club inconnu : 404", async () => {
    await expect(svc.situation("nimporte")).rejects.toThrow(/introuvable/);
  });

  it("dernier onze = feuille du match le plus RECENT (par date), titulaires par numero, banc : entres d'abord", async () => {
    const c = await contexte();
    const recent = await c.jouer(c.seniors, "15/03/2026");        // importe avant l'ancien : l'ordre de la base ne compte pas
    const ancien = await c.jouer(c.seniors, "27/09/2025");
    await c.feuille(recent.id, "NOUVEAU");
    await c.feuille(ancien.id, "ANCIEN");
    await f.joueur({ nom: "NOUVEAU9", prenom: "Jo", licence: "LIC9", clubId: c.moi.id, poste: "AT" });

    const r = await svc.situation(c.moi.id, { equipeId: c.seniors.id, saisonId: c.s.id });

    expect(r.dernierOnze!.match.id).toBe(recent.id);
    expect(r.dernierOnze!.titulaires.map((j) => j.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.dernierOnze!.titulaires[3]).toMatchObject({ nom: "NOUVEAU4", capitaine: true });
    expect(r.dernierOnze!.titulaires[8]).toMatchObject({ nom: "NOUVEAU9", poste: "AT", joueurId: expect.any(String) });
    expect(r.dernierOnze!.remplacants.map((j) => j.nom)).toEqual(["NOUVEAUENTRE", "NOUVEAUBANC"]);
  });

  it("dispositif : d'apres les seuls matchs renseignes ; aucun renseigne = pas de dispositif, jamais un defaut", async () => {
    const c = await contexte();
    await c.jouer(c.seniors, "21/09/2025", { formationDom: "4-3-3" });
    await c.jouer(c.seniors, "07/09/2025", { formationDom: "3-5-2" });
    await c.jouer(c.seniors, "14/09/2025", { formationDom: "4-3-3" });
    await c.jouer(c.seniors, "28/09/2025");
    const avec = await svc.situation(c.moi.id, { equipeId: c.seniors.id });

    expect(avec.systeme).toMatchObject({ observes: 3, matchs: 4 });
    expect(avec.systeme.prediction?.systeme).toBe("4-3-3");
    expect(avec.dernierMatch).toMatchObject({ formation: null });      // le dernier match n'est pas renseigne : on ne l'invente pas

    const autre = await svc.situation(c.moi.id, { equipeId: c.u20.id });
    expect(autre.systeme).toMatchObject({ prediction: null, observes: 0, matchs: 0 });
    expect(autre.dernierMatch).toBeNull();
    expect(autre.dernierOnze).toBeNull();
  });

  it("dispositif probable : les dispositifs renseignes, completes par les changements de numero de MES feuilles", async () => {
    const c = await contexte();
    // Mon attaquant porte le 9 puis le 10 ; l'adversaire (cote visiteur) porte d'autres numeros qui ne comptent pas.
    for (const [i, date] of ["07/09/2025", "14/09/2025", "21/09/2025", "28/09/2025"].entries()) {
      const m = await c.jouer(c.seniors, date);
      await f.compo({ matchId: m.id, cote: "dom", nom: "AVANT", prenom: "Leo", numero: i % 2 ? 10 : 9 });
      await f.compo({ matchId: m.id, cote: "ext", nom: "ADVERSE", prenom: "Zed", numero: i % 2 ? 4 : 2 });
    }

    const r = await svc.situation(c.moi.id, { equipeId: c.seniors.id });

    expect(r.systeme.prediction).toBeNull();                       // rien de saisi
    expect(r.systeme.probable).toMatchObject({ systeme: "4-4-2", source: "numeros", matchsNumeros: 4, observations: 0 });
    expect(r.systeme.probable!.indices.join(" ")).toMatch(/AVANT|Leo/);
    expect(r.systeme.probable!.indices.join(" ")).not.toMatch(/ADVERSE|Zed/);
  });

  it("le couple 4-4-2 / 4-2-3-1 ecrit en dur par l'ancien import n'est pas un dispositif", async () => {
    const c = await contexte();
    await c.jouer(c.seniors, "07/09/2025", { formationDom: "4-4-2", formationExt: "4-2-3-1" });

    const r = await svc.situation(c.moi.id, { equipeId: c.seniors.id });

    expect(r.systeme.prediction).toBeNull();
    expect(r.dernierMatch!.formation).toBeNull();
  });

  it("feuille du dernier match sans onze : on remonte au match precedent pour le onze, pas pour le dernier match", async () => {
    const c = await contexte();
    const vide = await c.jouer(c.seniors, "20/10/2025");
    const garni = await c.jouer(c.seniors, "13/10/2025", { formationDom: "4-4-2" });
    await c.feuille(garni.id, "G");

    const r = await svc.situation(c.moi.id, { equipeId: c.seniors.id });

    expect(r.dernierMatch!.id).toBe(vide.id);
    expect(r.dernierOnze!.match.id).toBe(garni.id);
    expect(r.dernierOnze!.match.formation).toBe("4-4-2");
  });

  it("match programme ignore ; portee par equipe : le onze d'une autre equipe du club n'est pas repris", async () => {
    const c = await contexte();
    await c.jouer(c.seniors, "20/12/2030", { statut: "prevu", scoreDom: 0, scoreExt: 0 });
    const u20 = await c.jouer(c.u20, "10/10/2025");
    await c.feuille(u20.id, "U");

    const seniors = await svc.situation(c.moi.id, { equipeId: c.seniors.id });
    const club = await svc.situation(c.moi.id);

    expect(seniors.dernierMatch).toBeNull();
    expect(seniors.dernierOnze).toBeNull();
    expect(club.dernierOnze!.match.id).toBe(u20.id);
  });

  it("vu de l'exterieur : score, issue et onze du cote du club", async () => {
    const c = await contexte();
    const m = await f.match({ clubDom: c.adv.id, clubExt: c.moi.id, equipeDomId: c.advEq.id, equipeExtId: c.seniors.id, saisonId: c.s.id, date: "05/10/2025", scoreDom: 3, scoreExt: 1, formationExt: "5-3-2" });
    await f.compo({ matchId: m.id, cote: "ext", numero: 1, nom: "MOI1" });
    await f.compo({ matchId: m.id, cote: "dom", numero: 1, nom: "ADV1" });

    const r = await svc.situation(c.moi.id, { equipeId: c.seniors.id });

    expect(r.dernierOnze!.match).toMatchObject({ domicile: false, bp: 1, bc: 3, issue: "D", formation: "5-3-2", adversaireId: c.adv.id });
    expect(r.dernierOnze!.titulaires.map((j) => j.nom)).toEqual(["MOI1"]);
  });
});
