import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import * as bcrypt from "bcryptjs";
import { Equipe, Saison, Utilisateur } from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { UtilisateursService } from "./utilisateurs.module";

describe("UtilisateursService : referent de club", () => {
  let ds: DataSource;
  let svc: UtilisateursService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new UtilisateursService(ds.getRepository(Utilisateur), ds.getRepository(Equipe), ds.getRepository(Saison));
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  async function contexte() {
    const clubA = await f.club("OL Sud");
    const clubB = await f.club("Mions");
    const s = await f.saison("2026-2027", 2026, { actif: true });
    const seniorsA = await f.equipe({ clubId: clubA.id, nom: "Seniors", saisonId: s.id });
    const u20A = await f.equipe({ clubId: clubA.id, nom: "U20", saisonId: s.id });
    const seniorsB = await f.equipe({ clubId: clubB.id, nom: "Seniors", saisonId: s.id });
    const compte = async (extra: Partial<Utilisateur>): Promise<Utilisateur> => {
      const repo = ds.getRepository(Utilisateur);
      return repo.save(repo.create({ passwordHash: "x", mustChangePassword: false, equipeIds: [], ...extra }));
    };
    const admin = await compte({ login: "AADMIN", prenom: "Admin", nom: "Admin", role: "admin" });
    const referentA = await compte({ login: "RDUPONT", prenom: "Rita", nom: "Dupont", role: "referent", clubId: clubA.id });
    const referentB = await compte({ login: "RMARTIN", prenom: "Remi", nom: "Martin", role: "referent", clubId: clubB.id });
    const educA = await compte({ login: "LDURAND", prenom: "Luc", nom: "Durand", role: "user", clubId: clubA.id, equipeIds: [seniorsA.id] });
    const educB = await compte({ login: "PLEROY", prenom: "Paul", nom: "Leroy", role: "user", clubId: clubB.id });
    const actA = { id: referentA.id, role: "referent", clubId: clubA.id };
    const actAdmin = { id: admin.id, role: "admin", clubId: null };
    return { clubA, clubB, seniorsA, u20A, seniorsB, admin, referentA, referentB, educA, educB, actA, actAdmin };
  }

  describe("acteur (d'apres la base)", () => {
    it("admin et referent : acteur reconnu ; educateur : refuse", async () => {
      const c = await contexte();
      expect(await svc.acteur({ sub: c.admin.id })).toMatchObject({ role: "admin" });
      expect(await svc.acteur({ sub: c.referentA.id })).toMatchObject({ role: "referent", clubId: c.clubA.id });
      await expect(svc.acteur({ sub: c.educA.id })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.acteur({ sub: "inconnu" })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("un jeton de referent dont le role a ete retire n'a plus de droits", async () => {
      const c = await contexte();
      await ds.getRepository(Utilisateur).update(c.referentA.id, { role: "user" });
      await expect(svc.acteur({ sub: c.referentA.id })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("liste", () => {
    it("le referent ne voit que les educateurs de son club", async () => {
      const c = await contexte();
      const liste = await svc.findAll(c.actA);
      expect(liste.map((u) => u.login)).toEqual(["LDURAND"]);
      expect(liste.every((u) => !("passwordHash" in u))).toBe(true);
    });

    it("l'admin voit tout le monde", async () => {
      const c = await contexte();
      expect((await svc.findAll(c.actAdmin)).map((u) => u.login).sort()).toEqual(["AADMIN", "LDURAND", "PLEROY", "RDUPONT", "RMARTIN"]);
    });
  });

  describe("creation d'educateurs par le referent", () => {
    it("plusieurs comptes pour son club, mot de passe initial a changer, equipes de son club", async () => {
      const c = await contexte();

      const a = await svc.create(c.actA, { prenom: "Jean", nom: "Petit", equipeIds: [c.seniorsA.id] });
      const b = await svc.create(c.actA, { prenom: "Lea", nom: "Moreau", role: "user", equipeIds: [c.u20A.id, c.seniorsA.id] });
      const sans = await svc.create(c.actA, { prenom: "Zoe", nom: "Blanc" });

      expect(a).toMatchObject({ login: "JPETIT", role: "user", clubId: c.clubA.id, mustChangePassword: true, equipeIds: [c.seniorsA.id], initialPassword: expect.any(String) });
      expect(b.equipeIds).toEqual([c.u20A.id, c.seniorsA.id]);
      expect(sans).toMatchObject({ clubId: c.clubA.id, equipeIds: [] });         // aucune equipe cochee : toutes les equipes du club
      expect("passwordHash" in a).toBe(false);
      const [relu] = await ds.getRepository(Utilisateur).find({ where: { login: "JPETIT" } });
      expect(await bcrypt.compare(a.initialPassword, relu.passwordHash)).toBe(true);
      expect((await svc.findAll(c.actA)).map((u) => u.login)).toEqual(["JPETIT", "LDURAND", "LMOREAU", "ZBLANC"]);
    });

    it("jamais un autre role : administrateur ou referent refuse", async () => {
      const c = await contexte();
      await expect(svc.create(c.actA, { prenom: "A", nom: "Admin2", role: "admin" })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.create(c.actA, { prenom: "R", nom: "Autre", role: "referent" })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("jamais pour un autre club, ni avec les equipes d'un autre club", async () => {
      const c = await contexte();
      await expect(svc.create(c.actA, { prenom: "X", nom: "Autreclub", clubId: c.clubB.id })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.create(c.actA, { prenom: "X", nom: "Equipeb", equipeIds: [c.seniorsB.id] })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.create(c.actA, { prenom: "X", nom: "Fantome", equipeIds: ["equipe-fantome"] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(await ds.getRepository(Utilisateur).count()).toBe(5);       // rien n'a ete cree
    });

    it("un login deja pris : conflit", async () => {
      const c = await contexte();
      await expect(svc.create(c.actA, { prenom: "Luc", nom: "Durand" })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("modification et suppression", () => {
    it("le referent gere ses educateurs : equipes, nom, mot de passe", async () => {
      const c = await contexte();

      const maj = await svc.update(c.actA, c.educA.id, { equipeIds: [c.seniorsA.id, c.u20A.id], resetPassword: "Nouveau12" });

      expect(maj).toMatchObject({ equipeIds: [c.seniorsA.id, c.u20A.id], mustChangePassword: true, clubId: c.clubA.id });
      const relu = await ds.getRepository(Utilisateur).findOneByOrFail({ id: c.educA.id });
      expect(await bcrypt.compare("Nouveau12", relu.passwordHash)).toBe(true);
      const renomme = await svc.update(c.actA, c.educA.id, { prenom: "Lucas" });
      expect(renomme.login).toBe("LDURAND");                       // 1re lettre du prenom : L (Luc -> Lucas)
    });

    it("pas d'elevation : ni role, ni club, ni equipes d'un autre club", async () => {
      const c = await contexte();
      await expect(svc.update(c.actA, c.educA.id, { role: "admin" })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.update(c.actA, c.educA.id, { role: "referent" })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.update(c.actA, c.educA.id, { clubId: c.clubB.id })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.update(c.actA, c.educA.id, { equipeIds: [c.seniorsB.id] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(await ds.getRepository(Utilisateur).findOneByOrFail({ id: c.educA.id })).toMatchObject({ role: "user", clubId: c.clubA.id });
    });

    it("hors perimetre = introuvable : educateur d'un autre club, referent, admin, soi-meme", async () => {
      const c = await contexte();
      for (const id of [c.educB.id, c.referentB.id, c.referentA.id, c.admin.id, "inconnu"]) {
        await expect(svc.findOne(c.actA, id)).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.update(c.actA, id, { prenom: "Hack" })).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.remove(c.actA, id)).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(await ds.getRepository(Utilisateur).count()).toBe(5);
    });

    it("le referent supprime un de ses educateurs", async () => {
      const c = await contexte();
      expect(await svc.remove(c.actA, c.educA.id)).toEqual({ ok: true, id: c.educA.id });
      expect((await svc.findAll(c.actA))).toEqual([]);
    });
  });

  describe("administrateur", () => {
    it("cree un referent (club obligatoire) ; promeut un educateur", async () => {
      const c = await contexte();
      await expect(svc.create(c.actAdmin, { prenom: "Nina", nom: "Roche", role: "referent" })).rejects.toBeInstanceOf(BadRequestException);

      const r = await svc.create(c.actAdmin, { prenom: "Nina", nom: "Roche", role: "referent", clubId: c.clubA.id });
      expect(r).toMatchObject({ role: "referent", clubId: c.clubA.id });

      const promu = await svc.update(c.actAdmin, c.educB.id, { role: "referent" });
      expect(promu).toMatchObject({ role: "referent", clubId: c.clubB.id });
    });

    it("un admin n'a pas de club ni d'equipes ; le dernier admin ne se supprime pas", async () => {
      const c = await contexte();
      const a2 = await svc.create(c.actAdmin, { prenom: "Eva", nom: "Admin", role: "admin", clubId: c.clubA.id, equipeIds: [c.seniorsA.id] });
      expect(a2).toMatchObject({ role: "admin", clubId: null, equipeIds: [] });
      await svc.remove(c.actAdmin, a2.id);
      await expect(svc.remove(c.actAdmin, c.admin.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("garde le comportement historique : un educateur sans club est refuse", async () => {
      const c = await contexte();
      await expect(svc.create(c.actAdmin, { prenom: "Sans", nom: "Club", role: "user" })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("createur du compte", () => {
    it("un compte cree porte son createur (referent ou admin), restitue dans la liste, la lecture et la modification", async () => {
      const c = await contexte();

      const parReferent = await svc.create(c.actA, { prenom: "Jean", nom: "Petit" });
      const parAdmin = await svc.create(c.actAdmin, { prenom: "Eva", nom: "Admin", role: "admin" });

      expect(parReferent.createur).toEqual({ id: c.referentA.id, login: "RDUPONT", prenom: "Rita", nom: "Dupont" });
      expect(parAdmin.createur).toEqual({ id: c.admin.id, login: "AADMIN", prenom: "Admin", nom: "Admin" });
      const liste = await svc.findAll(c.actAdmin);
      expect(liste.find((u) => u.login === "JPETIT")?.createur?.login).toBe("RDUPONT");
      expect((await svc.findOne(c.actA, parReferent.id)).createur?.login).toBe("RDUPONT");
      expect((await svc.update(c.actA, parReferent.id, { prenom: "Jeanne" })).createur?.login).toBe("RDUPONT");
    });

    it("compte anterieur au suivi : createur inconnu ; createur supprime depuis : signale, le compte reste", async () => {
      const c = await contexte();
      expect(await svc.findOne(c.actAdmin, c.educA.id)).toMatchObject({ createur: null, createurSupprime: false });

      const cree = await svc.create(c.actAdmin, { prenom: "Zoe", nom: "Blanc", role: "user", clubId: c.clubA.id });
      await ds.getRepository(Utilisateur).update(c.admin.id, { login: "AADMIN2" });
      expect((await svc.findOne(c.actAdmin, cree.id)).createur?.login).toBe("AADMIN2");      // le createur est resolu a chaque lecture
      await ds.getRepository(Utilisateur).update(cree.id, { createdById: "compte-disparu" });
      expect(await svc.findOne(c.actAdmin, cree.id)).toMatchObject({ createur: null, createurSupprime: true });
    });

    it("le createur ne se fixe pas par l'API : un champ createdById envoye est ignore", async () => {
      const c = await contexte();
      const cree = await svc.create(c.actA, { prenom: "Jean", nom: "Petit", createdById: c.admin.id } as any);
      expect(cree.createur?.login).toBe("RDUPONT");
      await svc.update(c.actA, cree.id, { createdById: c.admin.id } as any);
      expect((await svc.findOne(c.actA, cree.id)).createur?.login).toBe("RDUPONT");
    });
  });

  describe("saisons consultables", () => {
    async function saisons() {
      const s24 = await f.saison("2024-2025", 2024);
      const s25 = await f.saison("2025-2026", 2025);
      return { s24, s25 };
    }

    it("sans precision : toutes les saisons (comportement historique de l'API)", async () => {
      const c = await contexte();
      const e = await svc.create(c.actA, { prenom: "Jean", nom: "Petit" });
      expect(e).toMatchObject({ toutesSaisons: true, saisonIds: [] });
    });

    it("saison actuelle seulement, ou saison actuelle + saisons passees choisies", async () => {
      const c = await contexte();
      const { s24, s25 } = await saisons();

      const seule = await svc.create(c.actA, { prenom: "Jean", nom: "Petit", toutesSaisons: false });
      const choix = await svc.create(c.actA, { prenom: "Lea", nom: "Moreau", toutesSaisons: false, saisonIds: [s25.id, s24.id, s25.id] });

      expect(seule).toMatchObject({ toutesSaisons: false, saisonIds: [] });
      expect(choix).toMatchObject({ toutesSaisons: false, saisonIds: [s25.id, s24.id] });          // dedoublonne
      const relu = await ds.getRepository(Utilisateur).findOneByOrFail({ id: choix.id });
      expect(relu).toMatchObject({ toutesSaisons: false, saisonIds: [s25.id, s24.id] });
    });

    it("une saison inconnue est refusee, rien n'est cree", async () => {
      const c = await contexte();
      await expect(svc.create(c.actA, { prenom: "Jean", nom: "Petit", toutesSaisons: false, saisonIds: ["saison-fantome"] }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(await ds.getRepository(Utilisateur).count()).toBe(5);
    });

    it("modification : restreindre, elargir, revenir a toutes ; les saisons choisies sont oubliees quand on rend tout", async () => {
      const c = await contexte();
      const { s24, s25 } = await saisons();

      expect(await svc.update(c.actA, c.educA.id, { toutesSaisons: false })).toMatchObject({ toutesSaisons: false, saisonIds: [] });
      expect(await svc.update(c.actA, c.educA.id, { saisonIds: [s25.id] })).toMatchObject({ toutesSaisons: false, saisonIds: [s25.id] });
      expect(await svc.update(c.actA, c.educA.id, { prenom: "Lucas" })).toMatchObject({ toutesSaisons: false, saisonIds: [s25.id] });   // inchange
      expect(await svc.update(c.actA, c.educA.id, { saisonIds: [s25.id, s24.id] })).toMatchObject({ saisonIds: [s25.id, s24.id] });
      expect(await svc.update(c.actA, c.educA.id, { toutesSaisons: true })).toMatchObject({ toutesSaisons: true, saisonIds: [] });
      expect((await ds.getRepository(Utilisateur).findOneByOrFail({ id: c.educA.id })).saisonIds).toBeNull();
    });

    it("seul un educateur est restreint : un referent ou un administrateur voit toujours tout", async () => {
      const c = await contexte();
      const r = await svc.create(c.actAdmin, { prenom: "Nina", nom: "Roche", role: "referent", clubId: c.clubA.id, toutesSaisons: false });
      expect(r).toMatchObject({ toutesSaisons: true, saisonIds: [] });

      const e = await svc.update(c.actAdmin, c.educA.id, { toutesSaisons: false });
      expect(e.toutesSaisons).toBe(false);
      const promu = await svc.update(c.actAdmin, c.educA.id, { role: "referent" });
      expect(promu).toMatchObject({ toutesSaisons: true, saisonIds: [] });
    });
  });
});
