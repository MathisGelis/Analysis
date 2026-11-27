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

  it("deux jaunes au meme joueur : le second fait un rouge tout de suite ; annuler un jaune le retire, un rouge a la main n'est pas double", async () => {
    const mt = await matchNeuf();
    const a = t.appel(await ref());
    const put = (n: number, corps: object) => a("PUT", `${base(mt.id)}/evenements/${id(n)}`, corps);
    const carton = (type: string, minute: number, extra: object = {}) => ({ cote: "dom", type, periode: 1, minute, joueurNumero: 7, joueurNom: "Martin", ...extra });
    const rouges = async () => (await a("GET", base(mt.id))).corps.evenements.filter((e: any) => e.type === "carton_rouge");
    await put(1, carton("carton_jaune", 20));
    expect(await rouges()).toHaveLength(0);                                              // un seul jaune : pas de rouge
    await put(2, carton("carton_jaune", 55, { joueurNumero: 9, joueurNom: "Autre" }));
    expect(await rouges()).toHaveLength(0);                                              // un autre joueur : pas de rouge
    await put(3, carton("carton_jaune", 70));
    const [rouge] = await rouges();
    expect(rouge).toMatchObject({ id: `${id(3)}-2j`, cote: "dom", minute: 70, joueurNumero: 7 });   // le second jaune du 7 : rouge, meme minute
    expect((await a("GET", base(mt.id))).corps.compteurs.dom).toMatchObject({ jaunes: 3, rouges: 1 });
    await put(3, carton("carton_jaune", 72));                                            // le jaune bouge : le rouge le suit, sans doublon
    expect((await rouges()).map((e: any) => e.minute)).toEqual([72]);
    await a("DELETE", `${base(mt.id)}/evenements/${id(3)}`);                            // annule le second jaune : plus de rouge
    expect(await rouges()).toHaveLength(0);
    await put(3, carton("carton_jaune", 70));                                            // restaure : le rouge revient
    expect(await rouges()).toHaveLength(1);
    await a("DELETE", `${base(mt.id)}/evenements/${id(1)}`);                            // annule le premier jaune : le second n'est plus un second
    expect(await rouges()).toHaveLength(0);
    await put(1, carton("carton_jaune", 20));
    await put(4, carton("carton_rouge", 75));                                            // expulse a la main : pas de second rouge
    expect(await rouges()).toHaveLength(1);
    expect((await rouges())[0].id).toBe(id(4));
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

  it("changement de systeme : le nouveau dispositif (4-4-2 losange = 4-1-2-1-2) est le resultat ; un dispositif illisible est refuse", async () => {
    const mt = await matchNeuf();
    const a = t.appel(await ref());
    const put = (corps: object, n: number) => a("PUT", `${base(mt.id)}/evenements/${id(n)}`, corps);
    expect((await put({ cote: "dom", type: "systeme", resultat: "4-1-2-1-2", periode: 2, minute: 64 }, 7)).statut).toBe(200);
    expect((await put({ cote: "dom", type: "systeme", periode: 2, minute: 64 }, 8)).statut).toBe(400);                 // sans dispositif
    expect((await put({ cote: "dom", type: "systeme", resultat: "4-4-3", periode: 2, minute: 64 }, 9)).statut).toBe(400);  // 11 joueurs de champ
    expect((await put({ cote: "dom", type: "systeme", resultat: "losange", periode: 2, minute: 64 }, 9)).statut).toBe(400);
    const etat = (await a("GET", base(mt.id))).corps;
    expect(etat.evenements.filter((e: any) => e.type === "systeme").map((e: any) => e.resultat)).toEqual(["4-1-2-1-2"]);
    expect(etat.score).toEqual({ dom: 0, ext: 0 });                                                                    // un changement de systeme ne touche pas au score
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

  describe("avant-match : seuls les joueurs retenus se saisissent, avec leur numero du jour", () => {
    async function equipeAvecJoueurs() {
      const mt = await matchNeuf();
      const js: any[] = [];
      for (let i = 0; i < 14; i++) js.push(await t.f.joueur({ nom: `RET${i}`, prenom: "Test", clubId: m.ol.id, equipesAttachees: [m.sen26.id], numeroFavori: i + 1 } as any));
      return { mt, js };
    }
    const plan = (equipeId: string, matchId: string, titulaires: string[], remplacants: string[], numeros?: object) => ({ equipeId, matchId, formation: "4-4-2", titulaires, remplacants, ...(numeros ? { numeros } : {}) });

    it("sans avant-match : tout l'effectif et avantMatch.pret = false", async () => {
      const { mt, js } = await equipeAvecJoueurs();
      const etat = (await t.appel(await ref())("GET", base(mt.id))).corps;
      expect(etat.avantMatch).toEqual({ pret: false, titulaires: 0, banc: 0, possible: true });
      expect(etat.joueurs.length).toBeGreaterThanOrEqual(js.length);
    });

    it("avec l'avant-match : seulement titulaires puis remplacants, dans l'ordre, avec le numero choisi", async () => {
      const { mt, js } = await equipeAvecJoueurs();
      const a = t.appel(await ref());
      const onze = js.slice(0, 11).map((j) => j.id), banc = [js[11].id, js[12].id];
      const r = await a("PUT", "/tactiques", plan(m.sen26.id, mt.id, onze, banc, { [js[0].id]: 16, [js[11].id]: 99 }));
      expect(r.statut).toBe(200);
      const etat = (await a("GET", base(mt.id))).corps;
      expect(etat.avantMatch).toEqual({ pret: true, titulaires: 11, banc: 2, possible: true });
      expect(etat.joueurs.map((j: any) => j.id)).toEqual([...onze, ...banc]);              // le 14e joueur de l'effectif n'apparait pas
      expect(etat.joueurs.map((j: any) => j.role)).toEqual([...Array(11).fill("titulaire"), "remplacant", "remplacant"]);
      const num = (id: string) => etat.joueurs.find((j: any) => j.id === id).numero;
      expect(num(js[0].id)).toBe(16);                                                   // choisi pour ce match
      expect(num(js[11].id)).toBe(99);
      expect(num(js[1].id)).toBe(2);                                                    // sinon, son numero habituel
    });

    it("un match sans equipe de mon cote : on prend l'equipe de mon club qui a un effectif, plus de « effectif vide »", async () => {
      const { js } = await equipeAvecJoueurs();
      const mt = await t.f.match({ clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: null, saisonId: m.s26.id, date: "2026-11-22", statut: "prevu", scoreDom: 0, scoreExt: 0 } as any);
      const etat = (await t.appel(await ref())("GET", base(mt.id))).corps;
      expect(etat.avantMatch).toMatchObject({ pret: false, possible: true });
      expect(etat.equipeNousId).toBe(m.sen26.id);
      expect(etat.joueurs.length).toBeGreaterThanOrEqual(js.length);
    });

    it("un match rattache a une equipe sans joueur (autre saison) : l'effectif de l'equipe de mon club de meme categorie est propose", async () => {
      const { js } = await equipeAvecJoueurs();
      const mt = await t.f.match({ clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen25.id, saisonId: m.s26.id, date: "2026-11-22", statut: "prevu", scoreDom: 0, scoreExt: 0 } as any);
      const etat = (await t.appel(await ref())("GET", base(mt.id))).corps;
      expect(etat.equipeNousId).toBe(m.sen26.id);
      expect(etat.joueurs.length).toBeGreaterThanOrEqual(js.length);
    });

    it("un administrateur rattache a un club : son cote est celui de son club, et l'equipe du plan fait foi", async () => {
      const { mt, js } = await equipeAvecJoueurs();
      const admin = await t.compte({ login: `AD${Math.random().toString(36).slice(2, 7)}`, role: "admin", clubId: m.mions.id } as any);
      const a = t.appel(admin);
      expect((await a("GET", base(mt.id))).corps.nousCote).toBe("ext");                 // pas « dom » par defaut : on est Mions
      const onze = js.slice(0, 11).map((j) => j.id);
      expect((await a("PUT", "/tactiques", { equipeId: m.sen26.id, matchId: mt.id, formation: "4-4-2", titulaires: onze, remplacants: [] })).statut).toBe(200);
      const etat = (await t.appel(await ref())("GET", base(mt.id))).corps;
      expect(etat.equipeNousId).toBe(m.sen26.id);
      expect(etat.joueurs.map((j: any) => j.id)).toEqual(onze);
    });

    it("moins de 7 titulaires : l'avant-match n'est pas considere comme fait", async () => {
      const { mt, js } = await equipeAvecJoueurs();
      const a = t.appel(await ref());
      await a("PUT", "/tactiques", plan(m.sen26.id, mt.id, js.slice(0, 5).map((j) => j.id).concat(Array(6).fill("")), []));
      expect((await a("GET", base(mt.id))).corps.avantMatch).toMatchObject({ pret: false, titulaires: 5 });
    });

    it("le plan courant de l'equipe ne compte pas comme l'avant-match de ce match", async () => {
      const { mt, js } = await equipeAvecJoueurs();
      const a = t.appel(await ref());
      await a("PUT", "/tactiques", { equipeId: m.sen26.id, formation: "4-4-2", titulaires: js.slice(0, 11).map((j) => j.id), remplacants: [] });
      const etat = (await a("GET", base(mt.id))).corps;
      expect(etat.avantMatch.pret).toBe(false);
      expect(etat.joueurs.length).toBeGreaterThan(11);
    });

    it("un invite par lien ne voit que les joueurs retenus", async () => {
      const { mt, js } = await equipeAvecJoueurs();
      const staff = t.appel(await ref());
      await staff("PUT", "/tactiques", plan(m.sen26.id, mt.id, js.slice(0, 11).map((j) => j.id), []));
      const c = await staff("POST", `/direct/matchs/${mt.id}/invitations`, { libelle: "Julie" });
      const s = (await t.requete("POST", "/saisie/ouvrir", { jeton: c.corps.jeton })).corps.session;
      const etat = (await t.requete("GET", "/saisie/etat", undefined, { Authorization: `Invite ${s}` })).corps;
      expect(etat.joueurs).toHaveLength(11);
    });
  });
});
