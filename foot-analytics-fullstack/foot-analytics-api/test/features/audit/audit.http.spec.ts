// Journal d'audit sur l'application complete : lecture reservee a l'admin, aucune route d'ecriture, et les actions
// sensibles laissent bien leur trace.

import { AuthService } from "@/features/auth/auth.service";
import { JournalAudit } from "@/features/audit/journal-audit.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("journal d'audit (HTTP)", () => {
  let t: AppTest;
  let monde: Monde;

  beforeEach(async () => {
    t = await creerAppTest();
    monde = await creerMonde(t);
  });
  afterEach(() => t.fermer());

  const traces = (action: string) => t.ds.getRepository(JournalAudit).find({ where: { action } });

  it("lecture reservee a l'administrateur ; aucune route pour modifier ou effacer une trace", async () => {
    const admin = await t.compte({ login: "AADMIN", role: "admin" });
    const referent = await t.compte({ login: "RREF", role: "referent", clubId: monde.ol.id });
    const educ = await t.compte({ login: "LEDUC", role: "user", clubId: monde.ol.id });

    expect((await t.appel(admin)("GET", "/audit")).statut).toBe(200);
    expect((await t.appel(referent)("GET", "/audit")).statut).toBe(403);
    expect((await t.appel(educ)("GET", "/audit")).statut).toBe(403);
    expect((await t.appel()("GET", "/audit")).statut).toBe(401);
    for (const methode of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((await t.appel(admin)(methode, "/audit")).statut).toBe(404);
    }
  });

  it("connexions reussies et echouees tracees, sans jamais le login saisi", async () => {
    await t.compte({ login: "LDURAND", role: "user", clubId: monde.ol.id, passwordHash: await AuthService.hash("Un mot de passe solide") } as any);
    await t.appel()("POST", "/auth/login", { login: "LDURAND", password: "Un mot de passe solide" });
    await t.appel()("POST", "/auth/login", { login: "LDURAND", password: "faux" });
    await t.appel()("POST", "/auth/login", { login: "PERSONNE-INCONNU", password: "faux" });

    expect(await traces("connexion.reussie")).toHaveLength(1);
    const echecs = await traces("connexion.echec");
    expect(echecs.map((e) => e.details?.motif).sort()).toEqual(["login_inconnu", "mot_de_passe"]);
    const tout = JSON.stringify(await t.ds.getRepository(JournalAudit).find());
    expect(tout).not.toMatch(/PERSONNE-INCONNU|LDURAND|faux/);
  });

  it("fiche d'un joueur d'un autre club : tracee ; un joueur de mon club : non", async () => {
    const educ = await t.compte({ login: "LEDUC", role: "user", clubId: monde.ol.id });
    await t.appel(educ)("GET", `/joueurs/${monde.joueurMions.id}`);
    await t.appel(educ)("GET", `/joueurs/${monde.joueurOl.id}`);

    const vues = await traces("joueur.consultation_autre_club");
    expect(vues).toHaveLength(1);
    expect(vues[0]).toMatchObject({ utilisateurId: educ.user.id, cible: `joueur:${monde.joueurMions.id}`, cibleClubId: monde.mions.id });
  });

  it("gestion des comptes tracee : creation, reinitialisation, desactivation, suppression", async () => {
    const admin = await t.compte({ login: "AADMIN", role: "admin" });
    const cree = await t.appel(admin)("POST", "/utilisateurs", { prenom: "Jean", nom: "Petit", role: "user", clubId: monde.ol.id });
    await t.appel(admin)("PATCH", `/utilisateurs/${cree.corps.id}`, { reinitialiserMotDePasse: true });
    await t.appel(admin)("PATCH", `/utilisateurs/${cree.corps.id}`, { actif: false });
    await t.appel(admin)("DELETE", `/utilisateurs/${cree.corps.id}`);

    for (const action of ["compte.creation", "compte.mot_de_passe_reinitialise", "compte.desactivation", "compte.suppression"]) {
      const [trace] = await traces(action);
      expect(trace).toMatchObject({ utilisateurId: admin.user.id, cible: `utilisateur:${cree.corps.id}` });
    }
    // Le mot de passe temporaire n'est jamais dans le journal.
    expect(JSON.stringify(await t.ds.getRepository(JournalAudit).find())).not.toContain(cree.corps.initialPassword);
  });
});
