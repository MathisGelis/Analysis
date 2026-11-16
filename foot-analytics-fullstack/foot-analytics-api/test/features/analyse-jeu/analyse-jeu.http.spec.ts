// La route du resume d'un match : droits, direct et feuille de match melanges.

import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("analyse-jeu : resume d'un match", () => {
  let t: AppTest;
  let m: Monde;
  beforeAll(async () => { t = await creerAppTest(); m = await creerMonde(t); });
  afterAll(() => t.fermer());

  const ref = () => t.compte({ login: `RJ${Math.random().toString(36).slice(2, 7)}`, role: "referent", clubId: m.ol.id });
  const matchNeuf = () => t.f.match({
    clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, equipeExtId: m.mionsSen26.id, saisonId: m.s26.id,
    date: "2026-11-22", statut: "prevu", scoreDom: 0, scoreExt: 0,
  } as any);
  const route = (id: string) => `/analyse-jeu/matchs/${id}/resume`;

  it("refuse un autre club, un match inconnu et un visiteur anonyme", async () => {
    const mt = await matchNeuf();
    const tiers = await t.f.club("Club Tiers Jeu");
    const intrus = await t.compte({ login: "RTIERSJ1", role: "referent", clubId: tiers.id });
    expect((await t.appel(intrus)("GET", route(mt.id))).statut).toBe(403);
    expect((await t.appel(await ref())("GET", route("inconnu"))).statut).toBe(404);
    expect((await t.appel()("GET", route(mt.id))).statut).toBe(401);
  });

  it("un match saisi en direct : stats, tranches, carte des tirs", async () => {
    const mt = await matchNeuf();
    const a = t.appel(await ref());
    await a("POST", `/direct/matchs/${mt.id}/chrono`, { action: "demarrer" });
    const put = (n: number, corps: object) => a("PUT", `/direct/matchs/${mt.id}/evenements/jeu-${mt.id.slice(0, 6)}-${n}-xxxxxx`, corps);
    await put(1, { cote: "dom", type: "tir", resultat: "but", periode: 1, minute: 12, zoneTier: 0, zoneCouloir: 3 });
    await put(2, { cote: "dom", type: "tir", resultat: "non_cadre", periode: 1, minute: 30, zoneTier: 0, zoneCouloir: 3 });
    await put(3, { cote: "ext", type: "tir", resultat: "cadre", periode: 1, minute: 33 });
    await put(4, { cote: "dom", type: "corner", periode: 1, minute: 35 });
    const r = (await a("GET", route(mt.id))).corps;
    expect(r.sources.detail).toBe(true);
    expect(r.stats.find((s: any) => s.cle === "tirs")).toMatchObject({ nous: 2, eux: 1 });
    expect(r.tranches[0].nous).toBe(1);
    expect(r.carte.tirs[3]).toBe(2);
    expect(r.carte.buts[3]).toBe(1);
  });

  it("un match sans direct : feuille de match seule, resume limite", async () => {
    const mt = await t.f.match({ clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, saisonId: m.s26.id, date: "2026-10-04", statut: "joue", scoreDom: 1, scoreExt: 0 } as any);
    const r = (await t.appel(await ref())("GET", route(mt.id))).corps;
    expect(r.sources.detail).toBe(false);
    expect(r.score).toEqual({ nous: 1, eux: 0 });
    expect(r.constats[0].id).toBe("limite");
  });

  it("cote visiteur : « nous » est l'equipe du club visiteur", async () => {
    const mt = await matchNeuf();
    const mions = await t.compte({ login: "RMIONSJ1", role: "referent", clubId: m.mions.id });
    expect((await t.appel(mions)("GET", route(mt.id))).corps.nousCote).toBe("ext");
  });

  describe("jeu de la saison, croisements, adversaire", () => {
    /** Un match joue, saisi (tirs et un but) ou non. */
    async function joue(date: string, bp: number, bc: number, saisi: boolean, domicile = true, formation = "4-4-2") {
      const mt = await t.f.match({
        clubDom: domicile ? m.ol.id : m.mions.id, clubExt: domicile ? m.mions.id : m.ol.id,
        equipeDomId: domicile ? m.sen26.id : m.mionsSen26.id, equipeExtId: domicile ? m.mionsSen26.id : m.sen26.id,
        saisonId: m.s26.id, date, statut: "joue", scoreDom: domicile ? bp : bc, scoreExt: domicile ? bc : bp, formationDom: formation, formationExt: formation,
      } as any);
      if (saisi) {
        const a = t.appel(await ref());
        await a("POST", `/direct/matchs/${mt.id}/chrono`, { action: "demarrer" });
        const put = (n: number, corps: object) => a("PUT", `/direct/matchs/${mt.id}/evenements/jj-${mt.id.slice(0, 8)}-${n}-zzzzzz`, corps);
        const nous = domicile ? "dom" : "ext", eux = domicile ? "ext" : "dom";
        await put(1, { cote: nous, type: "tir", resultat: "but", periode: 1, minute: 12, zoneTier: 0, zoneCouloir: 3, contextes: ["CPA"] });
        await put(2, { cote: nous, type: "tir", resultat: "non_cadre", periode: 1, minute: 30, zoneTier: 0, zoneCouloir: 2 });
        await put(3, { cote: eux, type: "tir", resultat: "cadre", periode: 2, minute: 60, zoneTier: 0, zoneCouloir: 1 });
      }
      return mt;
    }
    const jeu = (q = "") => `/analyse-jeu/club/${m.ol.id}/jeu?equipeId=${m.sen26.id}${q}`;

    it("le jeu est reserve au staff du club", async () => {
      const tiers = await t.f.club("Club Tiers Jeu 2");
      const intrus = await t.compte({ login: "RTIERSJ2", role: "referent", clubId: tiers.id });
      expect((await t.appel(intrus)("GET", jeu())).statut).toBe(403);
      expect((await t.appel()("GET", jeu())).statut).toBe(401);
    });

    it("filtres : lieu et derniers matchs, valeurs invalides refusees", async () => {
      await joue("2027-03-01", 2, 0, true, true);
      await joue("2027-03-08", 0, 1, true, false);
      await joue("2027-03-15", 1, 1, false, true);
      const a = t.appel(await ref());
      const tous = (await a("GET", jeu())).corps;
      const dom = (await a("GET", jeu("&lieu=domicile"))).corps;
      const ext = (await a("GET", jeu("&lieu=exterieur"))).corps;
      const un = (await a("GET", jeu("&derniers=1"))).corps;
      expect(dom.jeu.couverture.matchs).toBeLessThan(tous.jeu.couverture.matchs);
      expect(dom.jeu.couverture.matchs + ext.jeu.couverture.matchs).toBe(tous.jeu.couverture.matchs);
      expect(un.jeu.couverture.matchs).toBe(1);
      expect(un.matchsDeLaSaison).toBe(tous.matchsDeLaSaison);
      expect((await a("GET", jeu("&lieu=nimporte"))).statut).toBe(400);
      expect((await a("GET", jeu("&derniers=0"))).statut).toBe(400);
      expect((await a("GET", jeu("&derniers=abc"))).statut).toBe(400);
    });

    it("tirs, carte et couverture sur les matchs saisis", async () => {
      const a = t.appel(await ref());
      const r = (await a("GET", jeu())).corps.jeu;
      expect(r.couverture.saisis).toBeGreaterThanOrEqual(2);
      expect(r.couverture.matchs).toBeGreaterThan(r.couverture.saisis);
      expect(r.tirs.pour.tirs).toBeGreaterThanOrEqual(4);
      expect(r.tirs.carte.pour.tirs[3]).toBeGreaterThanOrEqual(2);
      expect(r.tirs.familles.some((f: any) => f.famille === "Coup de pied arrêté")).toBe(true);
    });

    it("croisements : danger mesure, facteurs, dispositifs", async () => {
      const a = t.appel(await ref());
      const r = (await a("GET", `/analyse-jeu/club/${m.ol.id}/croisements?equipeId=${m.sen26.id}`)).corps;
      expect(r.croisements.minimum).toBe(5);
      expect(Array.isArray(r.croisements.facteurs)).toBe(true);
      expect(r.croisements.dispositifs.some((d: any) => d.formation === "4-4-2")).toBe(true);
      expect(r.couverture.saisis).toBeGreaterThanOrEqual(2);
      expect(r.croisements.danger.mesure.scoreDanger).toEqual(expect.any(Number));
    });

    it("adversaire : son jeu d'apres nos matchs contre lui, ses tirs et ses zones, jamais nos joueurs", async () => {
      const a = t.appel(await ref());
      const r = await a("GET", `/analyse-jeu/adversaire?equipeId=${m.sen26.id}&adversaireId=${m.mions.id}`);
      expect(r.statut).toBe(200);
      expect(r.corps.matchsContreNous).toBeGreaterThanOrEqual(2);
      expect(r.corps.jeu.tirs).not.toBeNull();
      expect(r.corps.jeu.joueurs).toEqual([]);
      expect((await a("GET", `/analyse-jeu/adversaire?equipeId=${m.sen26.id}`)).statut).toBe(400);
      const tiers = await t.f.club("Club Tiers Jeu 3");
      const intrus = await t.compte({ login: "RTIERSJ3", role: "referent", clubId: tiers.id });
      expect((await t.appel(intrus)("GET", `/analyse-jeu/adversaire?equipeId=${m.sen26.id}&adversaireId=${m.mions.id}`)).statut).toBe(403);
    });
  });
});
