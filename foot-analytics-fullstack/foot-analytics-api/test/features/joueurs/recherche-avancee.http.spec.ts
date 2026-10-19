// Recherche avancee de joueurs par HTTP : criteres, saisons ouvertes au compte, validation, trace d'audit, et aucune
// donnee privee d'un club dans les resultats (meme pour son propre club : la recherche ne rend que des donnees de
// championnat).

import { JournalAudit } from "@/features/audit/journal-audit.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("POST /joueurs/recherche-avancee", () => {
  let t: AppTest;
  let m: Monde;

  beforeAll(async () => {
    t = await creerAppTest();
    m = await creerMonde(t);
    const joueurs = t.ds.getRepository(Joueur);
    await joueurs.update(m.joueurOl.id, { licence: "LICOL0001", poste: "AT", dateNaissance: "2009-02-03" });
    await joueurs.update(m.joueurMions.id, { licence: "LICMI0002", poste: "AT" });
    // 2025-2026 : les deux jouent (Seniors D2). 2026-2027 : seul MARTIN (Mions) a une feuille.
    await t.f.compo({ matchId: m.m25.id, cote: "dom", numero: 9, nom: "DURAND", prenom: "Luc", licence: "LICOL0001" });
    await t.f.compo({ matchId: m.m25.id, cote: "ext", numero: 9, nom: "MARTIN", prenom: "Paul", licence: "LICMI0002" });
    await t.f.compo({ matchId: m.m26.id, cote: "ext", numero: 9, nom: "MARTIN", prenom: "Paul", licence: "LICMI0002" });
  });
  afterAll(() => t.fermer());

  const criteres = (extra: Record<string, unknown> = {}) => ({
    saisonId: m.s25.id, categorie: "Seniors", division: "D2", postes: ["AT", "AG", "AD"], situationSaisonId: m.s26.id, ...extra,
  });

  it("un attaquant qui a joue en Seniors D2 la saison derniere et n'a pas de club cette saison", async () => {
    const referent = await t.compte({ login: "RREF1", role: "referent", clubId: m.mions.id });
    const r = await t.appel(referent)("POST", "/joueurs/recherche-avancee", criteres({ situation: "sans_club" }));
    expect(r.statut).toBe(200);
    expect(r.corps.total).toBe(1);
    expect(r.corps.resultats[0]).toMatchObject({
      joueurId: m.joueurOl.id, nom: "DURAND", poste: "AT",
      periode: { clubId: m.ol.id, matchs: 1, equipes: [{ id: m.sen25.id }] },
      situation: { statut: "sans_club", clubId: null },
    });

    const tous = await t.appel(referent)("POST", "/joueurs/recherche-avancee", criteres({ situation: "indifferent" }));
    expect(tous.corps.resultats.map((x: any) => [x.nom, x.situation.statut])).toEqual([["DURAND", "sans_club"], ["MARTIN", "meme_club"]]);
  });

  it("aucune donnee privee dans les resultats, quel que soit le club du compte", async () => {
    for (const clubId of [m.ol.id, m.mions.id]) {
      const compte = await t.compte({ login: `RPRIV${clubId.slice(0, 4)}`, role: "referent", clubId });
      const r = await t.appel(compte)("POST", "/joueurs/recherche-avancee", criteres());
      const texte = JSON.stringify(r.corps);
      for (const prive of ["LICOL0001", "LICMI0002", "2009-02-03", "gaucher, rapide", "note privee de Mions", "tailleCm", "commentaire"]) {
        expect({ clubId, prive, present: texte.includes(prive) }).toEqual({ clubId, prive, present: false });
      }
    }
  });

  it("jamais au-dela des saisons ouvertes au compte", async () => {
    const restreint = await t.compte({ login: "ERESTR", role: "user", clubId: m.ol.id, toutesSaisons: false });
    const appeler = t.appel(restreint);
    expect((await appeler("POST", "/joueurs/recherche-avancee", criteres())).statut).toBe(404);
    expect((await appeler("POST", "/joueurs/recherche-avancee", { saisonId: m.s26.id, situationSaisonId: m.s25.id })).statut).toBe(404);
    expect((await appeler("POST", "/joueurs/recherche-avancee", { saisonId: m.s26.id })).statut).toBe(200);

    const options = (await appeler("GET", "/joueurs/recherche-avancee/options")).corps;
    expect(options.saisons.map((s: any) => s.id)).toEqual([m.s26.id]);
    expect(options.niveaux.every((n: any) => n.saisonId === m.s26.id)).toBe(true);
  });

  it("options : saisons (la plus recente en tete), niveaux de chaque saison, saisons par defaut", async () => {
    const referent = await t.compte({ login: "ROPT", role: "referent", clubId: m.ol.id });
    const o = (await t.appel(referent)("GET", "/joueurs/recherche-avancee/options")).corps;
    expect(o.saisons.map((s: any) => [s.nom, s.actuelle])).toEqual([["2026-2027", true], ["2025-2026", false], ["2024-2025", false]]);
    expect(o.niveaux).toEqual(expect.arrayContaining([
      { saisonId: m.s25.id, categorie: "Seniors", division: "D2" },
      { saisonId: m.s26.id, categorie: "U20", division: "R2" },
    ]));
    expect(o.defauts).toEqual({ saisonId: m.s25.id, situationSaisonId: m.s26.id });
  });

  it("criteres invalides : 400 ; sans connexion : 401", async () => {
    const referent = await t.compte({ login: "RVAL", role: "referent", clubId: m.ol.id });
    const appeler = t.appel(referent);
    expect((await appeler("POST", "/joueurs/recherche-avancee", {})).statut).toBe(400);
    expect((await appeler("POST", "/joueurs/recherche-avancee", criteres({ postes: ["XX"] }))).statut).toBe(400);
    expect((await appeler("POST", "/joueurs/recherche-avancee", criteres({ situation: "partout" }))).statut).toBe(400);
    expect((await appeler("POST", "/joueurs/recherche-avancee", criteres({ minMatchs: 0 }))).statut).toBe(400);
    expect((await t.appel()("POST", "/joueurs/recherche-avancee", criteres())).statut).toBe(401);
  });

  it("chaque recherche est tracee : criteres et nombre de resultats, sans nom", async () => {
    const referent = await t.compte({ login: "RAUD", role: "referent", clubId: m.ol.id });
    await t.appel(referent)("POST", "/joueurs/recherche-avancee", criteres({ situation: "sans_club" }));
    const traces = await t.ds.getRepository(JournalAudit).find({ where: { action: "joueur.recherche_avancee", utilisateurId: referent.user.id } });
    expect(traces).toHaveLength(1);
    expect(traces[0].details).toMatchObject({ saisonId: m.s25.id, categorie: "Seniors", situation: "sans_club", resultats: 1 });
    expect(JSON.stringify(traces[0])).not.toMatch(/DURAND|MARTIN|LIC/);
  });
});
