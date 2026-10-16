import { DataSource } from "typeorm";

import { JournalAudit } from "@/features/audit/journal-audit.entity";
import { JournalAuditService } from "@/features/audit/journal-audit.service";
import { REGLES_ALERTE } from "@/features/audit/alertes";
import { creerBaseTest } from "@test/support/test-db";

describe("JournalAuditService", () => {
  let ds: DataSource;
  let journal: JournalAuditService;
  const t0 = new Date("2026-10-16T08:00:00.000Z");
  const plus = (s: number) => new Date(t0.getTime() + s * 1000);
  const educ = { id: "compte-educ", role: "user", clubId: "club-a" };

  beforeEach(async () => {
    ds = await creerBaseTest();
    journal = new JournalAuditService(ds.getRepository(JournalAudit));
  });
  afterEach(() => ds.destroy());

  it("note une trace (compte, role, club, cible) et la restitue, la plus recente d'abord", async () => {
    await journal.noter("medical.lecture", { acteur: educ, cible: "joueur:j1", cibleClubId: "club-a" }, t0);
    await journal.noter("compte.creation", { acteur: educ, cible: "utilisateur:u2", details: { role: "user" } }, plus(1));

    const r = await journal.lister({});
    expect(r.total).toBe(2);
    expect(r.items.map((x) => x.action)).toEqual(["compte.creation", "medical.lecture"]);
    expect(r.items[1]).toMatchObject({ utilisateurId: "compte-educ", role: "user", clubId: "club-a", cible: "joueur:j1", cibleClubId: "club-a" });
    expect(r.items[0].details).toEqual({ role: "user" });
  });

  it("filtres : action (prefixe avec *), compte, periode ; pagination plafonnee a 100", async () => {
    for (let i = 0; i < 3; i++) await journal.noter("connexion.reussie", { acteur: educ }, plus(i));
    await journal.noter("connexion.echec", {}, plus(10));
    await journal.noter("compte.creation", { acteur: { id: "admin" } }, plus(20));

    expect((await journal.lister({ action: "connexion.*" })).total).toBe(4);
    expect((await journal.lister({ action: "connexion.reussie", utilisateurId: "compte-educ" })).total).toBe(3);
    expect((await journal.lister({ depuis: plus(5).toISOString() })).total).toBe(2);
    const page = await journal.lister({ parPage: 10_000, page: 1 });
    expect(page.parPage).toBe(100);
  });

  it("une trace qui ne s'enregistre pas ne fait jamais echouer l'operation", async () => {
    await ds.destroy();
    await expect(journal.noter("connexion.reussie", { acteur: educ })).resolves.toBeUndefined();
    ds = await creerBaseTest();
  });

  it("alerte : consultations massives de fiches d'autres clubs par un meme compte, une seule fois par fenetre", async () => {
    const regle = REGLES_ALERTE.find((r) => r.alerte === "alerte.consultations_massives")!;
    for (let i = 0; i < regle.seuil + 5; i++) {
      await journal.noter("joueur.consultation_autre_club", { acteur: educ, cible: `joueur:${i}` }, plus(i));
    }
    // Un autre compte, sous le seuil : pas d'alerte pour lui.
    for (let i = 0; i < 5; i++) await journal.noter("joueur.consultation_autre_club", { acteur: { id: "autre" } }, plus(i));

    const alertes = (await journal.lister({ action: "alerte.*" })).items;
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toMatchObject({ action: "alerte.consultations_massives", utilisateurId: "compte-educ" });
    expect(alertes[0].details).toMatchObject({ nombre: regle.seuil, seuil: regle.seuil });
  });

  it("alerte : echecs de connexion en rafale (tous comptes confondus)", async () => {
    const regle = REGLES_ALERTE.find((r) => r.alerte === "alerte.echecs_connexion")!;
    for (let i = 0; i < regle.seuil; i++) await journal.noter("connexion.echec", { ip: "203.0.113.7" }, plus(i));
    expect((await journal.lister({ action: "alerte.echecs_connexion" })).total).toBe(1);
  });

  it("alerte : exports en serie", async () => {
    const regle = REGLES_ALERTE.find((r) => r.alerte === "alerte.export_massif")!;
    for (let i = 0; i < regle.seuil - 1; i++) await journal.noter("export.pptx", { acteur: educ }, plus(i));
    expect((await journal.lister({ action: "alerte.*" })).total).toBe(0);
    await journal.noter("export.pptx", { acteur: educ }, plus(100));
    expect((await journal.lister({ action: "alerte.export_massif" })).total).toBe(1);
  });

  it("purge : seules les traces de plus de 12 mois disparaissent", async () => {
    await journal.noter("connexion.reussie", { acteur: educ }, new Date("2025-10-01T00:00:00.000Z"));
    await journal.noter("connexion.reussie", { acteur: educ }, new Date("2025-11-01T00:00:00.000Z"));

    expect(await journal.purger(t0)).toBe(1);
    expect((await journal.lister({})).items.map((x) => x.le)).toEqual(["2025-11-01T00:00:00.000Z"]);
  });
});
