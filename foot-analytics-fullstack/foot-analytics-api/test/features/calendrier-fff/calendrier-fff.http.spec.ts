// Calendrier FFF par HTTP : qui peut enregistrer, synchroniser ou deposer un calendrier ; telechargement (reseau simule, le
// serveur ne rappelle QUE media.fff.fr) ; fichier depose a la main ; tache quotidienne.

import { Equipe } from "@/features/equipes/equipe.entity";
import { CalendrierFffPlanificateur } from "@/features/calendrier-fff/calendrier-fff.planificateur";
import { Match } from "@/features/matchs/match.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";
import { construireIcs, saisonFictive } from "@test/support/calendrier-fff";

const ADRESSE = "https://media.fff.fr/calendars/2026/eq/6701_SEM_4.ics";
const ADRESSE_U20 = "https://media.fff.fr/calendars/2026/eq/6702_U20_1.ics";
// Des matchs a venir quelle que soit la date du jour : on part de demain.
const demain = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

describe("calendrier FFF : routes", () => {
  let t: AppTest;
  let m: Monde;
  let appelsFff: string[];
  const reel = globalThis.fetch;
  let reponseFff: (url: string) => Response | Promise<Response>;

  beforeAll(async () => {
    t = await creerAppTest();
    m = await creerMonde(t);
    // Le reseau de la FFF est simule ; tout le reste (l'API de test elle-meme) passe par le vrai fetch.
    jest.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url ?? String(input);
      if (!url.startsWith("https://media.fff.fr")) return reel(input, init);
      appelsFff.push(url);
      return reponseFff(url);
    });
  });
  afterAll(async () => { jest.restoreAllMocks(); await t.fermer(); });
  beforeEach(() => {
    appelsFff = [];
    reponseFff = () => new Response(construireIcs(saisonFictive(demain())), { status: 200 });
  });

  const referent = () => t.compte({ login: `RFF${Math.random().toString(36).slice(2, 6)}`, role: "referent", clubId: m.ol.id });
  const url = (equipeId: string, action: string) => `/calendrier-fff/equipes/${equipeId}/${action}`;

  async function deposer(jeton: string, equipeId: string, contenu: string, nom = "6701_SEM_4.ics") {
    const fd = new FormData();
    fd.append("file", new Blob([contenu], { type: "text/calendar" }), nom);
    const res = await reel(`${(await t.app.getUrl()).replace("[::1]", "localhost")}/api${url(equipeId, "importer")}`, { method: "POST", headers: { Authorization: `Bearer ${jeton}` }, body: fd });
    return { statut: res.status, corps: await res.json().catch(() => null) };
  }

  it("enregistre l'adresse (normalisee), la refuse si ce n'est pas un calendrier d'equipe FFF, l'efface", async () => {
    const ref = await referent();
    const appeler = t.appel(ref);
    const ok = await appeler("PUT", url(m.sen26.id, "adresse"), { url: "webcal://media.fff.fr/calendars/2026/eq/6701_SEM_4.ics" });
    expect(ok).toMatchObject({ statut: 200, corps: { calendrierUrl: ADRESSE, calendrierSynchroLe: null } });
    expect((await t.ds.getRepository(Equipe).findOneByOrFail({ id: m.sen26.id })).calendrierUrl).toBe(ADRESSE);
    for (const mauvaise of ["https://evil.example/calendars/2026/eq/a.ics", "http://media.fff.fr/calendars/2026/eq/a.ics", "n'importe quoi"]) {
      expect((await appeler("PUT", url(m.sen26.id, "adresse"), { url: mauvaise })).statut).toBe(400);
    }
    expect((await appeler("PUT", url(m.sen26.id, "adresse"), { url: "" })).corps.calendrierUrl).toBeNull();
    expect((await appeler("POST", url(m.sen26.id, "synchroniser"))).statut).toBe(400);      // plus d'adresse
  });

  it("synchronise depuis l'adresse : un seul appel, a media.fff.fr ; rapport des matchs crees ; erreurs de la FFF expliquees", async () => {
    const ref = await referent();
    const appeler = t.appel(ref);
    await appeler("PUT", url(m.sen26.id, "adresse"), { url: ADRESSE });
    const r = await appeler("POST", url(m.sen26.id, "synchroniser"));
    expect(r).toMatchObject({ statut: 200, corps: { source: "adresse", total: 6 } });
    expect(r.corps.crees).toHaveLength(6);
    expect(appelsFff).toEqual([ADRESSE]);
    expect(await t.ds.getRepository(Match).count({ where: { equipeDomId: m.sen26.id, statut: "prevu" } })).toBeGreaterThanOrEqual(3);
    expect((await t.ds.getRepository(Equipe).findOneByOrFail({ id: m.sen26.id })).calendrierSynchroLe).not.toBeNull();

    reponseFff = () => new Response("introuvable", { status: 404 });
    expect((await appeler("POST", url(m.sen26.id, "synchroniser"))).corps.message).toMatch(/introuvable \(404\)/);
    reponseFff = () => new Response("<html>page de maintenance</html>", { status: 200 });
    expect((await appeler("POST", url(m.sen26.id, "synchroniser"))).corps.message).toMatch(/n'est pas un calendrier/);
    reponseFff = () => { throw new TypeError("fetch failed"); };
    expect((await appeler("POST", url(m.sen26.id, "synchroniser"))).corps.message).toMatch(/injoignable/);
  });

  it("fichier depose a la main : meme traitement, sans aucun appel reseau ; trop gros ou absent : refuse", async () => {
    const ref = await referent();
    const avant = appelsFff.length;
    const r = await deposer(ref.jeton, m.sen26.id, construireIcs(saisonFictive(demain())));
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ source: "fichier", total: 6 });
    expect(appelsFff.length).toBe(avant);

    expect((await deposer(ref.jeton, m.sen26.id, "pas un calendrier")).statut).toBe(400);
    expect((await deposer(ref.jeton, m.sen26.id, "x".repeat(1_100_000))).statut).toBe(413);
    const sansFichier = await reel(`${(await t.app.getUrl()).replace("[::1]", "localhost")}/api${url(m.sen26.id, "importer")}`, { method: "POST", headers: { Authorization: `Bearer ${ref.jeton}` } });
    expect(sansFichier.status).toBe(400);
  });

  it("acces : sans connexion 401 ; un autre club 403 ; un educateur seulement pour ses equipes ; equipe inconnue 404", async () => {
    const contenu = construireIcs(saisonFictive(demain()));
    expect((await t.appel()("POST", url(m.sen26.id, "synchroniser"))).statut).toBe(401);

    const autreClub = await t.compte({ login: "RMIONSFF", role: "referent", clubId: m.mions.id });
    expect((await t.appel(autreClub)("PUT", url(m.sen26.id, "adresse"), { url: ADRESSE })).statut).toBe(403);
    expect((await deposer(autreClub.jeton, m.sen26.id, contenu)).statut).toBe(403);

    const educU20 = await t.compte({ login: "EOLFF", role: "user", clubId: m.ol.id, equipeIds: [m.u20.id] });
    expect((await deposer(educU20.jeton, m.sen26.id, contenu)).statut).toBe(403);          // pas son equipe
    expect((await t.appel(educU20)("PUT", url(m.u20.id, "adresse"), { url: ADRESSE_U20 })).statut).toBe(200);

    expect((await t.appel(await referent())("POST", url("equipe-inconnue", "synchroniser"))).statut).toBe(404);
  });

  it("tache quotidienne : chaque equipe a adresse de la saison actuelle ou a venir ; l'echec de l'une n'arrete pas les autres", async () => {
    const equipes = t.ds.getRepository(Equipe);
    await equipes.update(m.sen26.id, { calendrierUrl: ADRESSE });
    await equipes.update(m.u20.id, { calendrierUrl: ADRESSE_U20 });
    await equipes.update(m.sen25.id, { calendrierUrl: "https://media.fff.fr/calendars/2025/eq/1_SEM_1.ics" });   // saison terminee : ignoree
    reponseFff = (u) => (u === ADRESSE_U20 ? new Response("", { status: 404 }) : new Response(construireIcs(saisonFictive(demain())), { status: 200 }));

    const r = await t.app.get(CalendrierFffPlanificateur).toutSynchroniser();
    expect(r).toEqual({ reussies: 1, echecs: 1 });
    expect([...appelsFff].sort()).toEqual([ADRESSE, ADRESSE_U20].sort());
  });
});
