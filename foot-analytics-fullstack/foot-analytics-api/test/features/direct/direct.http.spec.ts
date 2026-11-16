// Le direct par HTTP : qui peut saisir, chrono, evenements idempotents, score, validation, cloture, journal d'audit.

import { JournalAudit } from "@/features/audit/journal-audit.entity";
import { Club } from "@/features/clubs/club.entity";
import { EvenementDirect } from "@/features/direct/evenement-direct.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

let essai = 0;                        // un identifiant d'evenement ne passe pas d'un match a l'autre : chaque test a les siens
const id = (n: number) => `evt-${String(essai).padStart(4, "0")}-${String(n).padStart(4, "0")}`;
const tir = (extra: Record<string, unknown> = {}) => ({ cote: "dom", type: "tir", resultat: "non_cadre", periode: 1, minute: 12, joueurNumero: 9, joueurNom: "Martin", zoneTier: 0, zoneCouloir: 2, contextes: ["Attaque placee"], ...extra });

describe("direct : routes", () => {
  let t: AppTest;
  let m: Monde;
  beforeAll(async () => { t = await creerAppTest(); m = await creerMonde(t); });
  afterAll(() => t.fermer());
  beforeEach(() => { essai++; });

  const ref = () => t.compte({ login: `RD${Math.random().toString(36).slice(2, 7)}`, role: "referent", clubId: m.ol.id });
  const base = (matchId: string) => `/direct/matchs/${matchId}`;
  /** Un match neuf par test : le direct d'un match garde son etat. */
  const matchNeuf = () => t.f.match({
    clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, equipeExtId: m.mionsSen26.id, saisonId: m.s26.id,
    date: "2026-11-22", statut: "prevu", scoreDom: 0, scoreExt: 0,
  } as any);

  it("lit l'etat d'un match a venir : avant le coup d'envoi, 0-0, mon cote, les clubs", async () => {
    const mt = await matchNeuf();
    const r = await t.appel(await ref())("GET", base(mt.id));
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({
      nousCote: "dom", score: { dom: 0, ext: 0 }, evenements: [],
      match: { id: mt.id, nomDom: "OL Sud", nomExt: "Mions", clubDom: m.ol.id },
      chrono: { statut: "avant", periode: 1, minute: 0, demarreLe: null, dureePeriodeMin: 45, clotureLe: null },
    });
    expect(typeof r.corps.chrono.serveurMs).toBe("number");
    expect(Array.isArray(r.corps.joueurs)).toBe(true);
  });

  it("le club visiteur saisit lui aussi : son cote est « ext »", async () => {
    const mt = await matchNeuf();
    const mions = await t.compte({ login: "RMIONS1", role: "referent", clubId: m.mions.id });
    expect((await t.appel(mions)("GET", base(mt.id))).corps.nousCote).toBe("ext");
  });

  it("refuse un autre club, un match inconnu et une personne non connectee", async () => {
    const mt = await matchNeuf();
    const tiers = await t.f.club("Club Tiers");
    const intrus = await t.compte({ login: "RTIERS1", role: "referent", clubId: tiers.id });
    for (const [methode, chemin, corps] of [["GET", base(mt.id)], ["POST", `${base(mt.id)}/chrono`, { action: "demarrer" }], ["PUT", `${base(mt.id)}/evenements/${id(1)}`, tir()]] as const) {
      expect((await t.appel(intrus)(methode, chemin, corps)).statut).toBe(403);
    }
    expect((await t.appel(await ref())("GET", base("inconnu"))).statut).toBe(404);
    expect((await t.appel()("GET", base(mt.id))).statut).toBe(401);
  });

  it("chrono : coup d'envoi, pause, reprise, mi-temps, deuxieme periode, fin ; une transition absurde est refusee (409)", async () => {
    const mt = await matchNeuf();
    const a = t.appel(await ref());
    const chrono = (action: string, extra: object = {}) => a("POST", `${base(mt.id)}/chrono`, { action, ...extra });
    expect((await chrono("pause")).statut).toBe(409);                      // pas commence
    expect((await chrono("demarrer")).corps.chrono).toMatchObject({ statut: "en_cours", periode: 1 });
    expect((await chrono("demarrer")).statut).toBe(409);
    expect((await chrono("pause")).corps.chrono.statut).toBe("pause");
    expect((await chrono("reprendre")).corps.chrono.statut).toBe("en_cours");
    expect((await chrono("corriger", { minute: 30 })).corps.chrono.minute).toBe(30);
    expect((await chrono("mi_temps")).corps.chrono).toMatchObject({ statut: "mi_temps", periode: 1 });
    expect((await chrono("deuxieme_periode")).corps.chrono).toMatchObject({ statut: "en_cours", periode: 2, minute: 45 });
    expect((await chrono("fin")).corps.chrono.statut).toBe("termine");
    expect((await chrono("n_importe_quoi")).statut).toBe(400);
  });

  it("evenements : idempotents (meme identifiant = meme evenement), le score suit, annuler puis restaurer", async () => {
    const mt = await matchNeuf();
    const a = t.appel(await ref());
    const put = (n: number, corps: object) => a("PUT", `${base(mt.id)}/evenements/${id(n)}`, corps);
    expect((await put(1, tir({ resultat: "but", zoneCadre: 2, contextes: ["Attaque placee", "Centre", "Centre"], joueur2Numero: 10, joueur2Nom: "Mercier" }))).statut).toBe(200);
    await put(1, tir({ resultat: "but", zoneCadre: 2, contextes: ["Attaque placee", "Centre"], joueur2Numero: 10, joueur2Nom: "Mercier" }));     // rejoue
    await put(2, tir({ cote: "ext", resultat: "but", minute: 22, joueurNumero: 9, joueurNom: undefined, zoneTier: 0, zoneCouloir: 1 }));
    await put(3, { cote: "dom", type: "corner", periode: 1, minute: 25 });
    let etat = (await a("GET", base(mt.id))).corps;
    expect(etat.evenements).toHaveLength(3);
    expect(etat.score).toEqual({ dom: 1, ext: 1 });
    expect(etat.compteurs.dom).toMatchObject({ tirs: 1, tirsCadres: 1, buts: 1, corners: 1 });
    expect(etat.evenements[0]).toMatchObject({ id: id(1), contextes: ["Attaque placee", "Centre"], zoneCadre: 2, minuteAffichee: "12" });

    // Correction : le meme identifiant remplace l'evenement.
    await put(1, tir({ resultat: "cadre", minute: 13 }));
    etat = (await a("GET", base(mt.id))).corps;
    expect(etat.score).toEqual({ dom: 0, ext: 1 });
    expect(etat.evenements.find((e: any) => e.id === id(1))).toMatchObject({ resultat: "cadre", minute: 13, joueur2Numero: null });

    // Annuler : il ne compte plus, la trace reste ; renvoyer la saisie le restaure.
    expect((await a("DELETE", `${base(mt.id)}/evenements/${id(2)}`)).statut).toBe(204);
    expect((await a("DELETE", `${base(mt.id)}/evenements/${id(2)}`)).statut).toBe(204);       // idempotent
    etat = (await a("GET", base(mt.id))).corps;
    expect(etat.score).toEqual({ dom: 0, ext: 0 });
    expect(await t.ds.getRepository(EvenementDirect).count({ where: { matchId: mt.id } })).toBe(3);
    await put(2, tir({ cote: "ext", resultat: "but", minute: 22 }));
    expect((await a("GET", base(mt.id))).corps.score).toEqual({ dom: 0, ext: 1 });
    expect((await a("DELETE", `${base(mt.id)}/evenements/${id(99)}`)).statut).toBe(404);
  });

  it("un identifiant d'evenement ne passe pas d'un match a un autre", async () => {
    const [a1, a2] = [await matchNeuf(), await matchNeuf()];
    const a = t.appel(await ref());
    expect((await a("PUT", `${base(a1.id)}/evenements/${id(7)}`, tir())).statut).toBe(200);
    expect((await a("PUT", `${base(a2.id)}/evenements/${id(7)}`, tir())).statut).toBe(409);
  });

  it("validation : resultat du type, zone du cadre, zone complete, identifiant, valeurs hors bornes", async () => {
    const mt = await matchNeuf();
    const a = t.appel(await ref());
    const put = (corps: object, n = 1) => a("PUT", `${base(mt.id)}/evenements/${id(n)}`, corps);
    expect((await put(tir({ resultat: "arrete" }))).statut).toBe(400);                         // « arrete » n'est pas un resultat de tir
    expect((await put({ cote: "dom", type: "corner", resultat: "but", periode: 1, minute: 3 })).statut).toBe(400);
    expect((await put(tir({ resultat: "non_cadre", zoneCadre: 1 }))).statut).toBe(400);        // cadre sans tir cadre
    expect((await put(tir({ zoneCouloir: undefined }))).statut).toBe(400);                     // tiers sans couloir
    expect((await put(tir({ zoneTier: 3 }))).statut).toBe(400);
    expect((await put(tir({ zoneCouloir: 5 }))).statut).toBe(400);
    expect((await put(tir({ type: "dribble" }))).statut).toBe(400);
    expect((await put(tir({ minute: 300 }))).statut).toBe(400);
    expect((await put(tir({ joueurNumero: 100 }))).statut).toBe(400);
    expect((await put(tir({ contextes: ["a", "b", "c", "d", "e", "f", "g"] }))).statut).toBe(400);
    expect((await a("PUT", `${base(mt.id)}/evenements/x`, tir())).statut).toBe(400);           // identifiant trop court
    expect((await put({ cote: "dom", type: "penalty", resultat: "arrete", periode: 2, minute: 70 }, 5)).statut).toBe(200);
  });

  it("cloture : seulement apres la fin ; ensuite plus de saisie, jusqu'a la reouverture", async () => {
    const mt = await matchNeuf();
    const a = t.appel(await ref());
    expect((await a("POST", `${base(mt.id)}/cloture`)).statut).toBe(409);                      // pas termine
    await a("POST", `${base(mt.id)}/chrono`, { action: "demarrer" });
    await a("POST", `${base(mt.id)}/chrono`, { action: "fin" });
    const cloture = await a("POST", `${base(mt.id)}/cloture`);
    expect(cloture.statut).toBe(200);
    expect(cloture.corps.chrono.clotureLe).toEqual(expect.any(String));
    expect((await a("PUT", `${base(mt.id)}/evenements/${id(1)}`, tir())).statut).toBe(409);
    expect((await a("DELETE", `${base(mt.id)}/evenements/${id(1)}`)).statut).toBe(409);
    expect((await a("POST", `${base(mt.id)}/chrono`, { action: "reprendre" })).statut).toBe(409);
    expect((await a("POST", `${base(mt.id)}/reouverture`)).corps.chrono.clotureLe).toBeNull();
    expect((await a("PUT", `${base(mt.id)}/evenements/${id(1)}`, tir())).statut).toBe(200);
  });

  it("le journal garde les modifications et suppressions (pas les ajouts), sans le nom des joueurs", async () => {
    const mt = await matchNeuf();
    const a = t.appel(await ref());
    await a("PUT", `${base(mt.id)}/evenements/${id(1)}`, tir({ joueurNom: "Nom Secret" }));
    await a("PUT", `${base(mt.id)}/evenements/${id(1)}`, tir({ minute: 14 }));
    await a("DELETE", `${base(mt.id)}/evenements/${id(1)}`);
    const traces = await t.ds.getRepository(JournalAudit).find({ where: { cible: `match:${mt.id}` } });
    expect(traces.map((x) => x.action).sort()).toEqual(["direct.evenement_modifie", "direct.evenement_supprime"]);
    expect(JSON.stringify(traces)).not.toContain("Nom Secret");
  });

  it("un club adverse reste distinct du mien : un match de la saison en cours d'un autre club n'est pas lisible", async () => {
    const autre = await t.f.club("Autre club");
    const autreEquipe = await t.f.equipe({ clubId: autre.id, saisonId: m.s26.id, nom: "Seniors", categorie: "Seniors", division: "D2", poule: "A", competitionLibelle: "x" } as any);
    const contre = await t.f.match({ clubDom: autre.id, clubExt: (await t.ds.getRepository(Club).findOneByOrFail({ id: m.mions.id })).id, equipeDomId: autreEquipe.id, saisonId: m.s26.id, date: "2026-11-29", statut: "prevu" } as any);
    const intrus = await t.compte({ login: "RINTRUS1", role: "referent", clubId: m.ol.id });
    expect((await t.appel(intrus)("GET", base(contre.id))).statut).toBe(403);
  });
});
