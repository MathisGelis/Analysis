// Authentification de bout en bout sur l'application complete : sessions, rotation et revocation des jetons,
// verrouillage, mot de passe temporaire a usage unique, comptes desactives, limites de debit.

import { DataSource, IsNull, Not } from "typeorm";

import { AuthService } from "@/features/auth/auth.service";
import { EntretienComptesService } from "@/features/auth/entretien-comptes.service";
import { Session } from "@/features/auth/session.entity";
import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";

const MDP = "Un mot de passe tres solide";

describe("authentification (HTTP)", () => {
  let t: AppTest;
  let ds: DataSource;
  const anonyme = () => t.appel();

  beforeEach(async () => {
    t = await creerAppTest();
    ds = t.ds;
  });
  afterEach(() => t.fermer());

  async function compte(login: string, extra: Partial<Utilisateur> = {}) {
    const club = await t.f.club(`Club ${login}`);
    return t.compte({ login, role: "user", clubId: club.id, passwordHash: await AuthService.hash(MDP), ...extra } as any);
  }
  const connexion = (login: string, password = MDP) => anonyme()("POST", "/auth/login", { login, password });
  const avecJeton = (jeton: string) => t.appel({ jeton });

  it("connexion : jeton d'acces court + jeton de rafraichissement, jamais le hash", async () => {
    await compte("LDURAND");
    const r = await connexion("ldurand");
    expect(r.statut).toBe(201);
    expect(r.corps).toMatchObject({ token: expect.any(String), refreshToken: expect.any(String), expiresIn: 900 });
    expect(r.corps.user).toMatchObject({ login: "LDURAND", mustChangePassword: false });
    expect(JSON.stringify(r.corps)).not.toMatch(/passwordHash|versionJeton|echecs/);
    expect((await avecJeton(r.corps.token)("GET", "/auth/me")).statut).toBe(200);
    // Seule l'empreinte du jeton de rafraichissement est stockee.
    const [s] = await ds.getRepository(Session).find();
    expect(s.empreinte).not.toBe(r.corps.refreshToken);
    expect(s.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it("mauvais mot de passe ou login inconnu : meme reponse", async () => {
    await compte("LDURAND");
    const faux = await connexion("LDURAND", "pas le bon mot de passe");
    const inconnu = await connexion("PERSONNE", "pas le bon mot de passe");
    expect([faux.statut, inconnu.statut]).toEqual([401, 401]);
    expect(faux.corps.message).toBe(inconnu.corps.message);
  });

  it("rotation : chaque rafraichissement change de jeton ; un rejeu tardif revoque toute la famille", async () => {
    await compte("LDURAND");
    const { refreshToken: r1 } = (await connexion("LDURAND")).corps;

    const a = await anonyme()("POST", "/auth/refresh", { refreshToken: r1 });
    expect(a.statut).toBe(201);
    const r2 = a.corps.refreshToken;
    expect(r2).toEqual(expect.any(String));
    expect(r2).not.toBe(r1);
    expect((await avecJeton(a.corps.token)("GET", "/auth/me")).statut).toBe(200);

    // Rafraichissements simultanes (meme navigateur) : le second recoit un jeton d'acces, sans nouveau jeton.
    const simultane = await anonyme()("POST", "/auth/refresh", { refreshToken: r1 });
    expect(simultane.statut).toBe(201);
    expect(simultane.corps.refreshToken).toBeNull();

    // Le meme jeton presente bien plus tard : copie presumee, la famille (r2 compris) est revoquee.
    await ds.getRepository(Session).update({ remplaceeLe: Not(IsNull()) }, { remplaceeLe: "2000-01-01T00:00:00.000Z" });
    expect((await anonyme()("POST", "/auth/refresh", { refreshToken: r1 })).statut).toBe(401);
    expect((await anonyme()("POST", "/auth/refresh", { refreshToken: r2 })).statut).toBe(401);
  });

  it("deconnexion : le jeton de rafraichissement ne sert plus", async () => {
    await compte("LDURAND");
    const { refreshToken } = (await connexion("LDURAND")).corps;
    expect((await anonyme()("POST", "/auth/logout", { refreshToken })).statut).toBe(201);
    expect((await anonyme()("POST", "/auth/refresh", { refreshToken })).statut).toBe(401);
    expect((await anonyme()("POST", "/auth/refresh", { refreshToken: "inconnu" })).statut).toBe(401);
  });

  it("deconnexion de tous les appareils : jetons d'acces deja emis et sessions revoques", async () => {
    await compte("LDURAND");
    const pc = (await connexion("LDURAND")).corps;
    const tel = (await connexion("LDURAND")).corps;
    expect((await avecJeton(pc.token)("POST", "/auth/logout-all")).statut).toBe(201);
    expect((await avecJeton(pc.token)("GET", "/auth/me")).statut).toBe(401);
    expect((await avecJeton(tel.token)("GET", "/auth/me")).statut).toBe(401);
    expect((await anonyme()("POST", "/auth/refresh", { refreshToken: tel.refreshToken })).statut).toBe(401);
    expect((await connexion("LDURAND")).statut).toBe(201);
  });

  it("verrouillage apres 5 echecs consecutifs, meme avec le bon mot de passe ensuite", async () => {
    const { user } = await compte("LDURAND");
    for (let i = 0; i < 5; i++) expect((await connexion("LDURAND", `faux ${i}`)).statut).toBe(401);
    const bloque = await connexion("LDURAND");
    expect(bloque.statut).toBe(429);
    expect(bloque.corps.code).toBe("COMPTE_VERROUILLE");
    // Fin du verrouillage : la connexion repasse, les echecs repartent de zero.
    await ds.getRepository(Utilisateur).update(user.id, { verrouilleJusqua: "2000-01-01T00:00:00.000Z" });
    expect((await connexion("LDURAND")).statut).toBe(201);
    expect((await ds.getRepository(Utilisateur).findOneByOrFail({ id: user.id })).echecsConnexion).toBe(0);
  });

  it("limite de debit : plus de 10 tentatives de connexion par minute depuis une meme adresse -> 429", async () => {
    const statuts: number[] = [];
    for (let i = 0; i < 11; i++) statuts.push((await connexion(`INCONNU${i}`, "x")).statut);
    expect(statuts.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuts[10]).toBe(429);
  });

  it("mot de passe temporaire : ne sert qu'a en choisir un nouveau, qui doit respecter la politique", async () => {
    const club = await t.f.club("OL Sud");
    const admin = await t.compte({ login: "AADMIN", role: "admin" });
    const cree = await t.appel(admin)("POST", "/utilisateurs", { prenom: "Jean", nom: "Petit", role: "user", clubId: club.id });
    expect(cree.statut).toBe(201);
    expect(cree.corps.initialPassword).toMatch(/^\S{4}-\S{4}-\S{4}-\S{4}$/);

    const premiere = await connexion("JPETIT", cree.corps.initialPassword);
    expect(premiere.statut).toBe(201);
    expect(premiere.corps.user.mustChangePassword).toBe(true);
    const tmp = avecJeton(premiere.corps.token);
    expect((await tmp("GET", "/auth/me")).statut).toBe(200);
    const bloque = await tmp("GET", "/matchs");
    expect(bloque.statut).toBe(403);
    expect(bloque.corps.code).toBe("MOT_DE_PASSE_A_CHANGER");

    const faible = await tmp("POST", "/auth/change-password", { oldPassword: cree.corps.initialPassword, newPassword: "Azerty123!" });
    expect(faible.statut).toBe(400);
    expect(faible.corps.code).toBe("MOT_DE_PASSE_FAIBLE");

    const ok = await tmp("POST", "/auth/change-password", { oldPassword: cree.corps.initialPassword, newPassword: MDP });
    expect(ok.statut).toBe(201);
    expect(ok.corps).toMatchObject({ token: expect.any(String), refreshToken: expect.any(String), user: { mustChangePassword: false } });
    expect((await tmp("GET", "/auth/me")).statut).toBe(401);                           // l'ancien jeton est revoque
    expect((await anonyme()("POST", "/auth/refresh", { refreshToken: premiere.corps.refreshToken })).statut).toBe(401);
    expect((await avecJeton(ok.corps.token)("GET", "/matchs")).statut).toBe(200);
    expect((await connexion("JPETIT", cree.corps.initialPassword)).statut).toBe(401);   // usage unique
  });

  it("l'ancien mot de passe commun n'ouvre plus un compte qui ne l'a jamais change", async () => {
    await compte("LDURAND", { passwordHash: await AuthService.hash("Bienvenue1"), mustChangePassword: true });
    const r = await connexion("LDURAND", "Bienvenue1");
    expect(r.statut).toBe(401);
    expect(r.corps.code).toBe("MOT_DE_PASSE_PERIME");
  });

  it("compte desactive : connexion refusee, jetons en cours revoques ; un gestionnaire le reactive", async () => {
    const admin = await t.compte({ login: "AADMIN", role: "admin" });
    const { user } = await compte("LDURAND");
    const avant = (await connexion("LDURAND")).corps;

    const off = await t.appel(admin)("PATCH", `/utilisateurs/${user.id}`, { actif: false });
    expect(off.corps).toMatchObject({ actif: false, desactiveLe: expect.any(String) });
    expect((await avecJeton(avant.token)("GET", "/auth/me")).statut).toBe(401);
    expect((await anonyme()("POST", "/auth/refresh", { refreshToken: avant.refreshToken })).statut).toBe(401);
    const refus = await connexion("LDURAND");
    expect(refus.statut).toBe(403);
    expect(refus.corps.code).toBe("COMPTE_DESACTIVE");
    expect((await connexion("LDURAND", "faux mot de passe")).statut).toBe(401);       // rien revele sans le bon mot de passe

    await t.appel(admin)("PATCH", `/utilisateurs/${user.id}`, { actif: true });
    expect((await connexion("LDURAND")).statut).toBe(201);
    expect((await t.appel(admin)("PATCH", `/utilisateurs/${admin.user.id}`, { actif: false })).statut).toBe(400);
  });

  it("entretien : les educateurs et referents sans connexion depuis 12 mois sont desactives, pas les admins", async () => {
    const repo = ds.getRepository(Utilisateur);
    const vieux = "2025-01-01T00:00:00.000Z";
    const { user: inactif } = await compte("INACTIF", { derniereActivite: vieux });
    const { user: referent } = await compte("RINACTIF", { role: "referent", derniereActivite: vieux });
    const { user: actif } = await compte("ACTIF", { derniereActivite: "2026-09-01T00:00:00.000Z" });
    const { user: admin } = await t.compte({ login: "AADMIN", role: "admin", derniereActivite: vieux } as any);
    const jeton = (await connexion("INACTIF")).corps.token;   // la connexion met a jour l'activite : on la remet a l'ancienne
    await repo.update(inactif.id, { derniereActivite: vieux });

    const r = await t.app.get(EntretienComptesService).entretenir(new Date("2026-10-16T08:00:00.000Z"));

    expect(r.desactives).toBe(2);
    expect((await repo.findOneByOrFail({ id: inactif.id })).desactiveLe).toEqual(expect.any(String));
    expect((await repo.findOneByOrFail({ id: referent.id })).desactiveLe).toEqual(expect.any(String));
    expect((await repo.findOneByOrFail({ id: actif.id })).desactiveLe).toBeNull();
    expect((await repo.findOneByOrFail({ id: admin.id })).desactiveLe).toBeNull();
    expect((await avecJeton(jeton)("GET", "/auth/me")).statut).toBe(401);
  });

  it("compte administrateur initial : mot de passe de ADMIN_INITIAL_PASSWORD, a usage unique", async () => {
    process.env.ADMIN_INITIAL_PASSWORD = "Mot de passe initial de test";
    try {
      await t.app.get(AuthService).bootstrapAdmin();
    } finally {
      delete process.env.ADMIN_INITIAL_PASSWORD;
    }
    const r = await connexion("AADMIN", "Mot de passe initial de test");
    expect(r.corps.user).toMatchObject({ role: "admin", mustChangePassword: true });
    expect((await connexion("AADMIN", "Bienvenue1")).statut).toBe(401);
  });
});
