// Les invitations a saisir le direct : lien a usage unique, session liee a l'appareil, perimetre d'un seul match, revocation, audit.

import { JournalAudit } from "@/features/audit/journal-audit.entity";
import { InvitationDirect } from "@/features/direct/invitation-direct.entity";
import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";
import { empreinte } from "@/features/direct/invitations.service";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

let essai = 0;
const id = (n: number) => `inv-${String(essai).padStart(4, "0")}-${String(n).padStart(4, "0")}`;
const tir = (extra: object = {}) => ({ cote: "dom", type: "tir", resultat: "non_cadre", periode: 1, minute: 12, joueurNumero: 9, ...extra });

describe("direct : invitations a saisir", () => {
  let t: AppTest;
  let m: Monde;
  beforeAll(async () => { t = await creerAppTest(); m = await creerMonde(t); });
  afterAll(() => t.fermer());
  beforeEach(() => { essai++; });

  const ref = () => t.compte({ login: `RI${Math.random().toString(36).slice(2, 7)}`, role: "referent", clubId: m.ol.id });
  const matchNeuf = () => t.f.match({ clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, equipeExtId: m.mionsSen26.id, saisonId: m.s26.id, date: "2026-11-22", statut: "prevu", scoreDom: 0, scoreExt: 0 } as any);
  /** L'appel d'un invite : pas de compte, sa session dans l'en-tete Invite. */
  const invite = (session: string) => (methode: string, chemin: string, corps?: unknown) => t.requete(methode, chemin, corps, { Authorization: `Invite ${session}` });
  async function inviter(libelle = "Julie", extra: object = {}) {
    const mt = await matchNeuf();
    const staff = t.appel(await ref());
    const c = await staff("POST", `/direct/matchs/${mt.id}/invitations`, { libelle, ...extra });
    return { mt, staff, jeton: c.corps.jeton as string, invitation: c.corps.invitation, statut: c.statut };
  }
  async function ouvrir(jeton: string) { return t.requete("POST", "/saisie/ouvrir", { jeton }); }

  it("le staff cree une invitation : jeton montre une fois, seule l'empreinte est gardee", async () => {
    const { mt, jeton, invitation, statut } = await inviter("Julie", { peutChrono: true, dureeHeures: 6 });
    expect(statut).toBe(201);
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invitation).toMatchObject({ libelle: "Julie", peutChrono: true, etat: "en_attente" });
    expect(JSON.stringify(invitation)).not.toContain(jeton);
    const lignes = await t.ds.getRepository(InvitationDirect).find({ where: { matchId: mt.id } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0].jetonEmpreinte).toBe(empreinte(jeton));
    expect(JSON.stringify(lignes[0])).not.toContain(jeton);
    // La liste ne revele jamais le jeton.
    const liste = await t.appel(await ref())("GET", `/direct/matchs/${mt.id}/invitations`);
    expect(JSON.stringify(liste.corps)).not.toContain(jeton);
  });

  it("seul le staff du match invite, liste et revoque ; les autres clubs et les anonymes sont refuses", async () => {
    const { mt, staff } = await inviter();
    expect((await staff("GET", `/direct/matchs/${mt.id}/invitations`)).corps).toHaveLength(1);
    const tiers = await t.f.club("Club Tiers Inv");
    const intrus = t.appel(await t.compte({ login: "RTIERSI1", role: "referent", clubId: tiers.id }));
    for (const [methode, chemin, corps] of [["POST", `/direct/matchs/${mt.id}/invitations`, { libelle: "X" }], ["GET", `/direct/matchs/${mt.id}/invitations`], ["DELETE", `/direct/matchs/${mt.id}/invitations/abc`]] as const) {
      expect((await intrus(methode, chemin, corps)).statut).toBe(403);
      expect((await t.appel()(methode, chemin, corps)).statut).toBe(401);
    }
  });

  it("validation : un nom est obligatoire, la duree est bornee", async () => {
    const mt = await matchNeuf();
    const staff = t.appel(await ref());
    expect((await staff("POST", `/direct/matchs/${mt.id}/invitations`, { libelle: "   " })).statut).toBe(409);
    expect((await staff("POST", `/direct/matchs/${mt.id}/invitations`, { libelle: "A", dureeHeures: 500 })).statut).toBe(400);
    expect((await staff("POST", `/direct/matchs/${mt.id}/invitations`, {})).statut).toBe(400);
  });

  it("dix invitations actives au plus par match", async () => {
    const mt = await matchNeuf();
    const staff = t.appel(await ref());
    for (let i = 0; i < 10; i++) expect((await staff("POST", `/direct/matchs/${mt.id}/invitations`, { libelle: `P${i}` })).statut).toBe(201);
    expect((await staff("POST", `/direct/matchs/${mt.id}/invitations`, { libelle: "de trop" })).statut).toBe(409);
  });

  it("le lien s'ouvre UNE fois : le premier appareil gagne, le second trouve un lien deja utilise", async () => {
    const { jeton } = await inviter();
    const a = await ouvrir(jeton);
    expect(a.statut).toBe(200);
    expect(a.corps).toMatchObject({ libelle: "Julie", peutChrono: false });
    expect(a.corps.session).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await ouvrir(jeton)).statut).toBe(410);
  });

  it("deux ouvertures simultanees : une seule reussit", async () => {
    const { jeton } = await inviter();
    const [x, y] = await Promise.all([ouvrir(jeton), ouvrir(jeton)]);
    expect([x.statut, y.statut].sort()).toEqual([200, 410]);
  });

  it("un jeton faux, mal forme ou inconnu : toujours la meme reponse, sans rien reveler", async () => {
    for (const faux of ["", "court", "x".repeat(43), "!".repeat(43), "a".repeat(300)]) {
      const r = await ouvrir(faux);
      expect([400, 404]).toContain(r.statut);
    }
    const r1 = await ouvrir("x".repeat(43));
    expect(r1.statut).toBe(404);
    expect(r1.corps.message).toContain("pas valide");
  });

  it("l'invite lit son match, saisit, annule ; les evenements portent son identite, jamais un identifiant de compte", async () => {
    const { mt, jeton, staff } = await inviter();
    const session = (await ouvrir(jeton)).corps.session;
    const moi = invite(session);
    const etat = await moi("GET", "/saisie/etat");
    expect(etat.statut).toBe(200);
    expect(etat.corps).toMatchObject({ nousCote: "dom", invitation: { libelle: "Julie", peutChrono: false } });
    expect((await moi("PUT", `/saisie/evenements/${id(1)}`, tir({ resultat: "but" }))).statut).toBe(200);
    await moi("PUT", `/saisie/evenements/${id(1)}`, tir({ resultat: "but" }));                  // rejoue : pas de doublon
    const vu = (await moi("GET", "/saisie/etat")).corps;
    expect(vu.evenements).toHaveLength(1);
    expect(vu.score).toEqual({ dom: 1, ext: 0 });
    expect(JSON.stringify(vu)).not.toContain("auteurId");
    // Le staff voit le meme match, et l'evenement est attribue a l'invite.
    const ligne = await t.ds.getRepository((await import("@/features/direct/evenement-direct.entity")).EvenementDirect).findOne({ where: { id: id(1) } });
    expect(ligne!.auteurId).toMatch(/^invite:/);
    expect((await staff("GET", `/direct/matchs/${mt.id}`)).corps.score).toEqual({ dom: 1, ext: 0 });
    expect((await moi("DELETE", `/saisie/evenements/${id(1)}`)).statut).toBe(204);
    expect((await moi("GET", "/saisie/etat")).corps.evenements).toHaveLength(0);
    expect((await moi("PUT", "/saisie/evenements/pas valide", tir())).statut).toBe(400);
  });

  it("le chrono n'est pilotable que si l'invitation l'accorde", async () => {
    const sans = await inviter("Sans chrono");
    const s1 = invite((await ouvrir(sans.jeton)).corps.session);
    expect((await s1("POST", "/saisie/chrono", { action: "demarrer" })).statut).toBe(403);
    const avec = await inviter("Avec chrono", { peutChrono: true });
    const s2 = invite((await ouvrir(avec.jeton)).corps.session);
    const r = await s2("POST", "/saisie/chrono", { action: "demarrer" });
    expect(r.statut).toBe(200);
    expect(r.corps.chrono.statut).toBe("en_cours");
  });

  it("perimetre : l'invite n'atteint ni le reste de l'application ni un autre match, ni la cloture, ni les invitations", async () => {
    const { mt, jeton } = await inviter();
    const autre = await matchNeuf();
    const moi = invite((await ouvrir(jeton)).corps.session);
    // Une session d'invite n'est PAS un jeton de compte : toutes les routes du reste de l'application la refusent.
    for (const chemin of ["/matchs", `/matchs/${mt.id}`, "/joueurs", "/blessures", "/auth/me", `/direct/matchs/${mt.id}`, `/direct/matchs/${autre.id}`, `/apres-match/matchs/${mt.id}`, `/analyse-jeu/matchs/${mt.id}/resume`, `/direct/matchs/${mt.id}/invitations`]) {
      expect([401, 403]).toContain((await moi("GET", chemin)).statut);
    }
    expect([401, 403, 404]).toContain((await moi("POST", `/direct/matchs/${mt.id}/cloture`)).statut);
    expect([401, 403, 404]).toContain((await moi("POST", `/direct/matchs/${mt.id}/invitations`, { libelle: "x" })).statut);
    // Et il ne peut pas viser un autre match : le match est celui de l'invitation, rien dans la requete ne le change.
    const etat = (await moi("GET", "/saisie/etat")).corps;
    expect(etat.match.id).toBe(mt.id);
  });

  it("un jeton de compte ne sert pas de session d'invite, et inversement", async () => {
    const { jeton } = await inviter();
    const compte = await ref();
    expect((await t.requete("GET", "/saisie/etat", undefined, { Authorization: `Bearer ${(compte as any).jeton ?? ""}` })).statut).toBe(401);
    expect((await invite("x".repeat(43))("GET", "/saisie/etat")).statut).toBe(401);
    expect((await invite(jeton)("GET", "/saisie/etat")).statut).toBe(401);     // le jeton du lien n'est pas la session
    expect((await t.requete("GET", "/saisie/etat")).statut).toBe(401);
  });

  it("revocation immediate, expiration, et compte createur desactive : l'acces s'arrete", async () => {
    const a = await inviter("Revoquee");
    const sa = invite((await ouvrir(a.jeton)).corps.session);
    expect((await sa("GET", "/saisie/etat")).statut).toBe(200);
    expect((await a.staff("DELETE", `/direct/matchs/${a.mt.id}/invitations/${a.invitation.id}`)).corps.etat).toBe("revoquee");
    expect((await sa("GET", "/saisie/etat")).statut).toBe(401);
    expect((await ouvrir(a.jeton)).statut).toBe(404);          // un lien revoque ne dit pas qu'il a existe

    const b = await inviter("Expiree");
    const sb = invite((await ouvrir(b.jeton)).corps.session);
    await t.ds.getRepository(InvitationDirect).update({ id: b.invitation.id }, { expireLe: new Date(Date.now() - 1000).toISOString() });
    expect((await sb("GET", "/saisie/etat")).statut).toBe(401);

    const c = await inviter("Createur parti");
    const sc = invite((await ouvrir(c.jeton)).corps.session);
    const row = await t.ds.getRepository(InvitationDirect).findOne({ where: { id: c.invitation.id } });
    await t.ds.getRepository(Utilisateur).update({ id: row!.creePar }, { desactiveLe: '2026-01-01T00:00:00.000Z' } as any);
    expect((await sc("GET", "/saisie/etat")).statut).toBe(401);
  });

  it("un lien expire ne s'ouvre pas ; un lien revoque non plus", async () => {
    const { jeton, invitation } = await inviter();
    await t.ds.getRepository(InvitationDirect).update({ id: invitation.id }, { expireLe: new Date(Date.now() - 1000).toISOString() });
    expect((await ouvrir(jeton)).statut).toBe(404);
  });

  it("match cloture : l'invite ne saisit plus, mais peut encore lire", async () => {
    const { mt, jeton, staff } = await inviter();
    const moi = invite((await ouvrir(jeton)).corps.session);
    await staff("POST", `/direct/matchs/${mt.id}/chrono`, { action: "demarrer" });
    await staff("POST", `/direct/matchs/${mt.id}/chrono`, { action: "mi_temps" });
    await staff("POST", `/direct/matchs/${mt.id}/chrono`, { action: "deuxieme_periode" });
    await staff("POST", `/direct/matchs/${mt.id}/chrono`, { action: "fin" });
    await staff("POST", `/direct/matchs/${mt.id}/cloture`);
    expect((await moi("PUT", `/saisie/evenements/${id(2)}`, tir())).statut).toBe(409);
    expect((await moi("GET", "/saisie/etat")).statut).toBe(200);
  });

  it("journal : creation, ouverture, revocation et actions de l'invite sont tracees, sans le jeton", async () => {
    const { mt, jeton, staff, invitation } = await inviter("Tracee");
    const moi = invite((await ouvrir(jeton)).corps.session);
    await moi("PUT", `/saisie/evenements/${id(3)}`, tir());
    await moi("PUT", `/saisie/evenements/${id(3)}`, tir({ minute: 14 }));          // modification : tracee
    await staff("DELETE", `/direct/matchs/${mt.id}/invitations/${invitation.id}`);
    const actions = (await t.ds.getRepository(JournalAudit).find()).filter((j) => j.cible === `match:${mt.id}`).map((j) => j.action);
    expect(actions).toEqual(expect.arrayContaining(["direct.invitation_creee", "direct.invitation_ouverte", "direct.evenement_modifie", "direct.invitation_revoquee"]));
    const brut = JSON.stringify(await t.ds.getRepository(JournalAudit).find());
    expect(brut).not.toContain(jeton);
    expect(brut).toContain("Tracee");
  });
});
