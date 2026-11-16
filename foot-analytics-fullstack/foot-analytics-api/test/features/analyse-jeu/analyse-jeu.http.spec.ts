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
});
