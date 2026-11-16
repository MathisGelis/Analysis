// L'apres-match par HTTP : qui y accede, notes par demi-point, minutes et faits repris du direct, bilan, journal.

import { JournalAudit } from "@/features/audit/journal-audit.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("apres-match : routes", () => {
  let t: AppTest;
  let m: Monde;
  beforeAll(async () => { t = await creerAppTest(); m = await creerMonde(t); });
  afterAll(() => t.fermer());

  const ref = () => t.compte({ login: `RA${Math.random().toString(36).slice(2, 7)}`, role: "referent", clubId: m.ol.id });
  const base = (id: string) => `/apres-match/matchs/${id}`;
  /** Un match neuf, trois joueurs dans l'equipe. */
  async function monde() {
    const mt = await t.f.match({ clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, equipeExtId: m.mionsSen26.id, saisonId: m.s26.id, date: "2026-11-22", statut: "prevu", scoreDom: 0, scoreExt: 0 } as any);
    const [a, b, c] = await Promise.all(["ALPHA", "BRAVO", "CHARLIE"].map((nom) => t.f.joueur({ nom, prenom: "Test", clubId: m.ol.id, equipesAttachees: [m.sen26.id] } as any)));
    return { mt, a, b, c };
  }
  const direct = (mt: string) => `/direct/matchs/${mt}`;
  const evt = (n: number) => `evt-apres-${String(Date.now() % 1e6).padStart(6, "0")}-${n}`;

  it("ferme tant que le match n'a pas commence, puis ouvert apres le coup d'envoi", async () => {
    const { mt } = await monde();
    const a = t.appel(await ref());
    expect((await a("GET", base(mt.id))).statut).toBe(409);
    await a("POST", `${direct(mt.id)}/chrono`, { action: "demarrer" });
    expect((await a("GET", base(mt.id))).statut).toBe(200);
  });

  it("refuse un autre club, un match inconnu et une personne non connectee", async () => {
    const { mt } = await monde();
    const tiers = await t.f.club("Club Tiers Apres");
    const intrus = await t.compte({ login: "RTIERSA1", role: "referent", clubId: tiers.id });
    expect((await t.appel(intrus)("GET", base(mt.id))).statut).toBe(403);
    expect((await t.appel(await ref())("GET", base("inconnu"))).statut).toBe(404);
    expect((await t.appel()("GET", base(mt.id))).statut).toBe(401);
  });

  it("minutes et faits viennent du direct ; notes par demi-point, effacables ; le journal ne garde pas la valeur", async () => {
    const { mt, a: ja, b: jb, c: jc } = await monde();
    const a = t.appel(await ref());
    await a("POST", `${direct(mt.id)}/chrono`, { action: "demarrer" });
    await a("PUT", `${direct(mt.id)}/evenements/${evt(1)}`, { cote: "dom", type: "tir", resultat: "but", periode: 1, minute: 12, joueurId: ja.id, joueurNom: "ALPHA", joueur2Id: jb.id });
    await a("PUT", `${direct(mt.id)}/evenements/${evt(2)}`, { cote: "dom", type: "remplacement", periode: 1, minute: 30, joueurId: ja.id, joueur2Id: jc.id });
    const etat = (await a("GET", base(mt.id))).corps;
    const par = (id: string) => etat.joueurs.find((j: any) => j.id === id);
    expect(par(ja.id)).toMatchObject({ aJoue: true, faits: { buts: 1 } });
    expect(par(jb.id)).toMatchObject({ faits: { passes: 1 } });
    expect(par(jc.id)).toMatchObject({ aJoue: true });
    expect(par(ja.id).minutes).toBe(30);

    expect((await a("PUT", `${base(mt.id)}/joueurs/${ja.id}`, { note: 7.5, commentaire: "Tres bon match" })).corps).toMatchObject({ note: 7.5, commentaire: "Tres bon match" });
    expect((await a("PUT", `${base(mt.id)}/joueurs/${ja.id}`, { note: 7.3 })).statut).toBe(400);   // pas un demi-point
    expect((await a("PUT", `${base(mt.id)}/joueurs/${ja.id}`, { note: 11 })).statut).toBe(400);
    expect((await a("PUT", `${base(mt.id)}/joueurs/inconnu`, { note: 5 })).statut).toBe(404);
    expect(par(ja.id)).toBeDefined();
    const apres = (await a("GET", base(mt.id))).corps;
    expect(apres.joueurs.find((j: any) => j.id === ja.id)).toMatchObject({ note: 7.5, commentaire: "Tres bon match" });
    expect(apres.avancement.notes).toBe(1);
    await a("PUT", `${base(mt.id)}/joueurs/${ja.id}`, { note: null });
    expect((await a("GET", base(mt.id))).corps.joueurs.find((j: any) => j.id === ja.id).note).toBeNull();

    const journal = await t.ds.getRepository(JournalAudit).find();
    expect(journal.some((j) => j.action === "apres_match.note_joueur")).toBe(true);
    expect(JSON.stringify(journal.filter((j) => j.action === "apres_match.note_joueur"))).not.toContain("Tres bon match");
  });

  it("les notes d'un club ne sont jamais lues par l'autre", async () => {
    const { mt, a: ja } = await monde();
    const nous = t.appel(await ref());
    await nous("POST", `${direct(mt.id)}/chrono`, { action: "demarrer" });
    await nous("PUT", `${base(mt.id)}/joueurs/${ja.id}`, { note: 9 });
    const mions = t.appel(await t.compte({ login: "RMIONSA1", role: "referent", clubId: m.mions.id }));
    const r = await mions("GET", base(mt.id));
    expect(r.statut).toBe(200);
    expect(r.corps.nousCote).toBe("ext");
    expect(JSON.stringify(r.corps)).not.toContain(ja.id);
  });

  it("bilan : enregistre, relu, et compte dans l'avancement", async () => {
    const { mt } = await monde();
    const a = t.appel(await ref());
    await a("POST", `${direct(mt.id)}/chrono`, { action: "demarrer" });
    expect((await a("GET", base(mt.id))).corps.avancement.bilan).toBe(false);
    expect((await a("PUT", `${base(mt.id)}/bilan`, { positifs: "Pressing haut", aTravailler: "Coups de pied arretes" })).corps).toMatchObject({ positifs: "Pressing haut", aTravailler: "Coups de pied arretes" });
    const etat = (await a("GET", base(mt.id))).corps;
    expect(etat.bilan.positifs).toBe("Pressing haut");
    expect(etat.avancement.bilan).toBe(true);
  });

  it("blessures signalees en direct, du cote de mon equipe seulement", async () => {
    const { mt, b } = await monde();
    const a = t.appel(await ref());
    await a("POST", `${direct(mt.id)}/chrono`, { action: "demarrer" });
    await a("PUT", `${direct(mt.id)}/evenements/${evt(5)}`, { cote: "dom", type: "blessure", periode: 1, minute: 40, joueurId: b.id, joueurNom: "BRAVO" });
    await a("PUT", `${direct(mt.id)}/evenements/${evt(6)}`, { cote: "ext", type: "blessure", periode: 1, minute: 41, joueurNumero: 4 });
    expect((await a("GET", base(mt.id))).corps.blessures).toEqual([expect.objectContaining({ minute: 40, joueurId: b.id })]);
  });
});
