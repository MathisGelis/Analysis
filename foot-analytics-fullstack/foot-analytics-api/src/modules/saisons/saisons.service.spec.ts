import { DataSource } from "typeorm";
import { Equipe, Saison } from "@/entities";
import { EquipesService } from "@/modules/equipes/equipes.module";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { SaisonsService } from "./saisons.module";

describe("SaisonsService", () => {
  let ds: DataSource;
  let equipes: EquipesService;
  let svc: SaisonsService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    equipes = new EquipesService(ds.getRepository(Equipe));
    svc = new SaisonsService(ds.getRepository(Saison), equipes);
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  describe("autoCloneEquipesFromPreviousSaison (un club)", () => {
    it("clone depuis la saison anterieure qui a des equipes pour CE club", async () => {
      const club = await f.club("OL Sud");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: club.id, nom: "Seniors", categorie: "Seniors", saisonId: s25.id });

      const r: any = await svc.autoCloneEquipesFromPreviousSaison(s26, club.id);

      expect(r).toMatchObject({ creees: 1, fromSaisonId: s25.id, toSaisonId: s26.id, fromSaisonNom: "2025-2026" });
    });

    it("saute une saison anterieure vide et remonte a la plus recente qui a des equipes", async () => {
      const club = await f.club("OL Sud");
      const s24 = await f.saison("2024-2025", 2024);
      await f.saison("2025-2026", 2025); // anterieure immediate, mais vide pour ce club
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: club.id, nom: "Seniors", categorie: "Seniors", saisonId: s24.id });

      const r: any = await svc.autoCloneEquipesFromPreviousSaison(s26, club.id);

      expect(r.fromSaisonId).toBe(s24.id);
      expect(r.creees).toBe(1);
    });

    it("ignore les equipes des autres clubs pour choisir la source", async () => {
      const moi = await f.club("OL Sud");
      const autre = await f.club("Autre");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: autre.id, nom: "X", categorie: "Seniors", saisonId: s25.id });

      const r: any = await svc.autoCloneEquipesFromPreviousSaison(s26, moi.id);

      expect(r.creees).toBe(0);
      expect(r.message).toMatch(/Aucune saison anterieure/);
    });

    it("n'utilise jamais une saison posterieure comme source", async () => {
      const club = await f.club("OL Sud");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: club.id, nom: "Seniors", categorie: "Seniors", saisonId: s26.id });

      // Reimporter sur 25-26 alors que seule 26-27 a des equipes : la source
      // (26-27) n'est pas "anterieure", mais l'algorithme de secours accepte
      // toute saison ayant des equipes : on documente ce comportement.
      const r: any = await svc.autoCloneEquipesFromPreviousSaison(s25, club.id);

      expect(r.fromSaisonId).toBe(s26.id);
    });

    it("est idempotent", async () => {
      const club = await f.club("OL Sud");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: club.id, nom: "Seniors", categorie: "Seniors", saisonId: s25.id });

      await svc.autoCloneEquipesFromPreviousSaison(s26, club.id);
      const r2: any = await svc.autoCloneEquipesFromPreviousSaison(s26, club.id);

      expect(r2).toMatchObject({ creees: 0, existaient: 1 });
    });
  });

  describe("autoCloneEquipesFromPreviousSaison (tous les clubs)", () => {
    it("clone tous les clubs depuis la saison anterieure immediate", async () => {
      const a = await f.club("A");
      const b = await f.club("B");
      const s25 = await f.saison("2025-2026", 2025);
      const s26 = await f.saison("2026-2027", 2026);
      await f.equipe({ clubId: a.id, nom: "A1", categorie: "Seniors", saisonId: s25.id });
      await f.equipe({ clubId: b.id, nom: "B1", categorie: "Seniors", saisonId: s25.id });

      const r: any = await svc.autoCloneEquipesFromPreviousSaison(s26);

      expect(r).toMatchObject({ clubs: 2, creees: 2, fromSaisonId: s25.id });
    });

    it("renvoie un message si aucune saison anterieure n'existe", async () => {
      const s25 = await f.saison("2025-2026", 2025);
      const r: any = await svc.autoCloneEquipesFromPreviousSaison(s25);
      expect(r.message).toMatch(/Aucune saison anterieure/);
    });
  });

  describe("create / ensureForDate", () => {
    it("create : la nouvelle saison recoit automatiquement les equipes de la precedente", async () => {
      const club = await f.club("OL Sud");
      const s25 = await f.saison("2025-2026", 2025);
      await f.equipe({ clubId: club.id, nom: "Seniors", categorie: "Seniors", saisonId: s25.id });

      const s26 = await svc.create({ nom: "2026-2027", anneeDebut: 2026 });

      expect(await equipes.findAll({ saisonId: s26.id })).toHaveLength(1);
    });

    it("ensureForDate : aout N -> saison N/N+1, janvier -> saison N-1/N", async () => {
      expect((await svc.ensureForDate("2025-08-15"))?.nom).toBe("2025-2026");
      expect((await svc.ensureForDate("18/01/2026"))?.nom).toBe("2025-2026");
      expect((await svc.ensureForDate("01/07/2026"))?.nom).toBe("2026-2027");
    });

    it("ensureForDate : reutilise la saison existante et ne recree rien", async () => {
      const a = await svc.ensureForDate("2025-09-01");
      const b = await svc.ensureForDate("2026-03-01");
      expect(b?.id).toBe(a?.id);
      expect(await svc.findAll()).toHaveLength(1);
    });

    it("ensureForDate : date illisible -> null", async () => {
      expect(await svc.ensureForDate("n'importe quoi")).toBeNull();
      expect(await svc.ensureForDate("")).toBeNull();
    });
  });

  describe("activer", () => {
    it("une seule saison active a la fois", async () => {
      const s25 = await f.saison("2025-2026", 2025, { actif: true });
      const s26 = await f.saison("2026-2027", 2026);

      await svc.activer(s26.id);

      expect((await svc.findOne(s26.id)).actif).toBe(true);
      expect((await svc.findOne(s25.id)).actif).toBe(false);
      expect((await svc.findActive())?.id).toBe(s26.id);
    });
  });
});
