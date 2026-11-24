// Le planning de l'equipe : garde cote serveur, par equipe, prive aux comptes qui la gerent.

import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("planning de l'equipe : routes", () => {
  let t: AppTest;
  let m: Monde;
  beforeAll(async () => { t = await creerAppTest(); m = await creerMonde(t); });
  afterAll(() => t.fermer());

  const ref = () => t.compte({ login: `RP${Math.random().toString(36).slice(2, 7)}`, role: "referent", clubId: m.ol.id });
  const base = (equipeId: string) => `/planning-equipe/${equipeId}`;

  it("vide au depart, puis jours et heure enregistres (tries, sans doublon) et relus", async () => {
    const a = t.appel(await ref());
    expect((await a("GET", base(m.sen26.id))).corps).toEqual({ planning: null, autres: [] });
    const r = await a("PUT", `${base(m.sen26.id)}/planning`, { jours: [3, 1, 3], heure: "19:30" });
    expect(r.statut).toBe(200);
    expect(r.corps).toEqual({ jours: [1, 3], heure: "19:30" });
    expect((await a("GET", base(m.sen26.id))).corps.planning).toEqual({ jours: [1, 3], heure: "19:30" });
    await a("PUT", `${base(m.sen26.id)}/planning`, { jours: [], heure: "18:00" });                // aucun jour : permis
    expect((await a("GET", base(m.sen26.id))).corps.planning).toEqual({ jours: [], heure: "18:00" });
  });

  it("refuse un planning invalide", async () => {
    const a = t.appel(await ref());
    for (const corps of [{ jours: [7], heure: "19:30" }, { jours: [1], heure: "25:00" }, { jours: "1", heure: "19:30" }, { heure: "19:30" }]) {
      expect((await a("PUT", `${base(m.sen26.id)}/planning`, corps)).statut).toBe(400);
    }
  });

  it("evenements « autre » : idempotents, modifiables, supprimables, tries par date", async () => {
    const a = t.appel(await ref());
    const put = (id: string, corps: object) => a("PUT", `${base(m.sen26.id)}/autres/${id}`, corps);
    expect((await put("evt-aaaa-0001", { date: "2026-12-05", titre: "Reunion", heure: "20:00" })).statut).toBe(200);
    await put("evt-aaaa-0002", { date: "2026-12-01", titre: "Deplacement", description: " Car a 8h " });
    await put("evt-aaaa-0001", { date: "2026-12-05", titre: "Reunion staff", heure: "20:00" });     // rejoue avec un titre corrige
    const { autres } = (await a("GET", base(m.sen26.id))).corps;
    expect(autres.map((e: any) => [e.id, e.titre])).toEqual([["evt-aaaa-0002", "Deplacement"], ["evt-aaaa-0001", "Reunion staff"]]);
    expect(autres[0]).toMatchObject({ description: "Car a 8h" });
    expect((await a("DELETE", `${base(m.sen26.id)}/autres/evt-aaaa-0002`)).statut).toBe(204);
    expect((await a("DELETE", `${base(m.sen26.id)}/autres/evt-aaaa-0002`)).statut).toBe(204);       // idempotent
    expect((await a("GET", base(m.sen26.id))).corps.autres).toHaveLength(1);
    expect((await put("pas bon", { date: "2026-12-05", titre: "x" })).statut).toBe(400);              // identifiant invalide
    expect((await put("evt-aaaa-0003", { date: "05/12/2026", titre: "x" })).statut).toBe(400);        // date invalide
    expect((await put("evt-aaaa-0003", { date: "2026-12-05", titre: "" })).statut).toBe(400);         // titre vide
  });

  it("prive a l'equipe : un autre club, une personne non connectee et un identifiant d'une autre equipe n'y touchent pas", async () => {
    const a = t.appel(await ref());
    await a("PUT", `${base(m.sen26.id)}/autres/evt-bbbb-0001`, { date: "2026-12-05", titre: "Secret" });
    const intrus = t.appel(await t.compte({ login: `RX${Math.random().toString(36).slice(2, 7)}`, role: "referent", clubId: m.mions.id }));
    expect((await intrus("GET", base(m.sen26.id))).statut).toBe(403);
    expect((await intrus("PUT", `${base(m.sen26.id)}/planning`, { jours: [1], heure: "19:00" })).statut).toBe(403);
    expect((await t.requete("GET", base(m.sen26.id))).statut).toBe(401);
    // Le meme identifiant ne se reprend pas dans une autre equipe de mon club, et ne supprime rien.
    expect((await a("PUT", `${base(m.u20.id)}/autres/evt-bbbb-0001`, { date: "2026-12-06", titre: "Pris" })).statut).toBe(404);
    await a("DELETE", `${base(m.u20.id)}/autres/evt-bbbb-0001`);
    expect((await a("GET", base(m.sen26.id))).corps.autres.map((e: any) => e.titre)).toContain("Secret");
  });
});
