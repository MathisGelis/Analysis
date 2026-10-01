// Les comptes face a l'API REELLE : jetons signes, gardes globaux, base de test. Chaque describe pose un aspect de la
// politique d'acces (features/acces/contexte-acces.ts) et verifie ce que renvoie l'API, pas ce que le front voudrait afficher.

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { RapportScouting } from "@/features/scouting/rapport-scouting.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("API : acces", () => {
  let t: AppTest;
  let m: Monde;

  beforeEach(async () => {
    t = await creerAppTest();
    m = await creerMonde(t);
  });
  afterEach(() => t.fermer());

  describe("authentification", () => {
    it("sans jeton : 401", async () => {
      expect((await t.appel()("GET", "/clubs")).statut).toBe(401);
    });

    it("un compte supprime perd l'acces tout de suite, sans attendre l'expiration de son jeton", async () => {
      const educ = await t.compte({ login: "LDURAND", role: "user", clubId: m.ol.id });
      expect((await t.appel(educ)("GET", "/clubs")).statut).toBe(200);
      await t.ds.getRepository(Utilisateur).delete(educ.user.id);
      expect((await t.appel(educ)("GET", "/clubs")).statut).toBe(401);
    });
  });

  /** Les trois profils face au meme monde. */
  async function profils() {
    const admin = await t.compte({ login: "AADMIN", role: "admin" });
    const referent = await t.compte({ login: "RDUPONT", role: "referent", clubId: m.ol.id });
    const libre = await t.compte({ login: "LLIBRE", role: "user", clubId: m.ol.id });                       // toutes saisons, toutes equipes
    const restreint = await t.compte({ login: "RRESTR", role: "user", clubId: m.ol.id, toutesSaisons: false, saisonIds: [m.s25.id] });
    const seniors = await t.compte({ login: "SSENIOR", role: "user", clubId: m.ol.id, equipeIds: [m.sen26.id] });   // equipe attribuee : Seniors D2
    const courant = await t.compte({ login: "CCOURANT", role: "user", clubId: m.ol.id, toutesSaisons: false, saisonIds: [] });
    return { admin, referent, libre, restreint, seniors, courant };
  }
  const ids = (r: { corps: any }) => (r.corps as { id: string }[]).map((x) => x.id).sort();

  describe("saisons", () => {
    it("liste : l'admin, le referent et un educateur sans restriction voient tout ; un educateur restreint, ses saisons ouvertes", async () => {
      const p = await profils();
      const toutes = [m.s24.id, m.s25.id, m.s26.id].sort();
      for (const c of [p.admin, p.referent, p.libre]) expect(ids(await t.appel(c)("GET", "/saisons"))).toEqual(toutes);
      expect(ids(await t.appel(p.restreint)("GET", "/saisons"))).toEqual([m.s25.id, m.s26.id].sort());
      expect(ids(await t.appel(p.courant)("GET", "/saisons"))).toEqual([m.s26.id]);
    });

    it("une saison fermee est introuvable (404), une saison ouverte se lit ; la saison active reste visible", async () => {
      const p = await profils();
      expect((await t.appel(p.courant)("GET", `/saisons/${m.s24.id}`)).statut).toBe(404);
      expect((await t.appel(p.courant)("GET", `/saisons/${m.s26.id}`)).statut).toBe(200);
      expect((await t.appel(p.restreint)("GET", `/saisons/${m.s25.id}`)).statut).toBe(200);
      expect((await t.appel(p.courant)("GET", "/saisons/active")).corps.id).toBe(m.s26.id);
    });

    it("creer, modifier, activer, supprimer une saison : administrateur seulement (403 pour tous les autres)", async () => {
      const p = await profils();
      for (const c of [p.referent, p.libre, p.restreint]) {
        const a = t.appel(c);
        expect((await a("POST", "/saisons", { nom: "2027-2028", anneeDebut: 2027 })).statut).toBe(403);
        expect((await a("PATCH", `/saisons/${m.s25.id}`, { nom: "x" })).statut).toBe(403);
        expect((await a("PATCH", `/saisons/${m.s25.id}/activer`)).statut).toBe(403);
        expect((await a("DELETE", `/saisons/${m.s25.id}`)).statut).toBe(403);
      }
      expect((await t.appel(p.admin)("POST", "/saisons", { nom: "2027-2028", anneeDebut: 2027 })).statut).toBe(201);
      // Les refus n'ont rien change : la saison 2025-2026 existe toujours, sous le meme nom, et 2026-2027 reste l'active.
      expect(await t.ds.getRepository(Saison).findOneByOrFail({ id: m.s25.id })).toMatchObject({ nom: "2025-2026", actif: false });
      expect(await t.ds.getRepository(Saison).findOneByOrFail({ id: m.s26.id })).toMatchObject({ actif: true });
    });

    it("auto-clone : un compte non admin ne clone que pour son club ; une saison fermee est introuvable", async () => {
      const p = await profils();
      const a = t.appel(p.libre);
      expect((await a("POST", `/saisons/${m.s26.id}/auto-clone?clubId=${m.mions.id}`)).statut).toBe(403);
      expect((await a("POST", `/saisons/${m.s26.id}/auto-clone`)).statut).toBe(201);                // sans clubId : SON club
      expect((await t.appel(p.courant)("POST", `/saisons/${m.s24.id}/auto-clone`)).statut).toBe(404);
    });
  });

  describe("equipes", () => {
    it("liste : saisons fermees et equipes non attribuees masquees ; les equipes adverses restent visibles (scouting)", async () => {
      const p = await profils();
      const toutes = await t.appel(p.libre)("GET", "/equipes");
      expect(ids(toutes)).toContain(m.sen24.id);                                             // sans restriction : tout
      const seniors = ids(await t.appel(p.seniors)("GET", "/equipes"));
      expect(seniors).toContain(m.sen26.id);
      expect(seniors).toContain(m.sen25.id);                                                 // meme niveau (Seniors D2), autre saison, autre poule
      expect(seniors).not.toContain(m.u20.id);                                               // U20 : pas attribuee
      expect(seniors).toContain(m.mionsSen26.id);                                            // equipe d'un autre club : visible
      const courant = ids(await t.appel(p.courant)("GET", "/equipes"));
      expect(courant).toContain(m.sen26.id);
      expect(courant).toContain(m.u20.id);
      expect(courant).not.toContain(m.sen25.id);
      expect(courant).not.toContain(m.mionsSen24.id);
    });

    it("lecture d'une equipe : saison fermee ou equipe non attribuee de mon club = 404", async () => {
      const p = await profils();
      expect((await t.appel(p.courant)("GET", `/equipes/${m.sen25.id}`)).statut).toBe(404);
      expect((await t.appel(p.seniors)("GET", `/equipes/${m.u20.id}`)).statut).toBe(404);
      expect((await t.appel(p.seniors)("GET", `/equipes/${m.sen26.id}`)).statut).toBe(200);
      expect((await t.appel(p.seniors)("GET", `/equipes/${m.mionsSen26.id}`)).statut).toBe(200);
    });

    it("creer, modifier, supprimer une equipe : admin, ou referent du club concerne ; jamais un educateur", async () => {
      const p = await profils();
      const nouvelle = { clubId: m.ol.id, nom: "U17 R1 Poule A", saisonId: m.s26.id };
      expect((await t.appel(p.libre)("POST", "/equipes", nouvelle)).statut).toBe(403);
      expect((await t.appel(p.referent)("POST", "/equipes", { ...nouvelle, clubId: m.mions.id })).statut).toBe(403);
      const creee = await t.appel(p.referent)("POST", "/equipes", nouvelle);
      expect(creee.statut).toBe(201);
      expect((await t.appel(p.libre)("PATCH", `/equipes/${creee.corps.id}`, { nom: "x", clubId: m.ol.id })).statut).toBe(403);
      expect((await t.appel(p.referent)("PATCH", `/equipes/${m.mionsSen26.id}`, { nom: "x", clubId: m.mions.id })).statut).toBe(403);
      expect((await t.appel(p.referent)("PATCH", `/equipes/${creee.corps.id}`, { nom: "U17 R1", clubId: m.mions.id })).statut).toBe(403);   // pas de transfert
      expect((await t.appel(p.referent)("DELETE", `/equipes/${creee.corps.id}`)).statut).toBe(200);
      expect((await t.appel(p.admin)("DELETE", `/equipes/${m.mionsSen25.id}`)).statut).toBe(200);
    });
  });

  describe("matchs et classement", () => {
    it("liste : les matchs des saisons fermees ne sont pas renvoyes", async () => {
      const p = await profils();
      expect(ids(await t.appel(p.libre)("GET", "/matchs"))).toEqual([m.m24.id, m.m25.id, m.m26.id, m.mU20.id].sort());
      expect(ids(await t.appel(p.restreint)("GET", "/matchs"))).toEqual([m.m25.id, m.m26.id, m.mU20.id].sort());
      expect(ids(await t.appel(p.courant)("GET", "/matchs"))).toEqual([m.m26.id, m.mU20.id].sort());
      expect(ids(await t.appel(p.courant)("GET", `/matchs?clubId=${m.mions.id}`))).toEqual([m.m26.id, m.mU20.id].sort());
    });

    it("lecture d'un match d'une saison fermee : 404 ; ouverte : 200 (match adverse compris)", async () => {
      const p = await profils();
      expect((await t.appel(p.courant)("GET", `/matchs/${m.m24.id}`)).statut).toBe(404);
      expect((await t.appel(p.courant)("GET", `/matchs/${m.m26.id}`)).statut).toBe(200);
      expect((await t.appel(p.restreint)("GET", `/matchs/${m.m25.id}`)).statut).toBe(200);
    });

    it("classement : les lignes des saisons fermees ne sont pas renvoyees", async () => {
      const p = await profils();
      const saisons = async (c: { jeton: string }) => [...new Set((await t.appel(c)("GET", "/classement")).corps.map((l: any) => l.saisonId))].sort();
      expect(await saisons(p.libre)).toEqual([m.s24.id, m.s25.id, m.s26.id].sort());
      expect(await saisons(p.restreint)).toEqual([m.s25.id, m.s26.id].sort());
      expect(await saisons(p.courant)).toEqual([m.s26.id]);
    });

    it("programmer un match : un des clubs est le mien ; jamais un match entre deux autres clubs ni dans une saison fermee", async () => {
      const p = await profils();
      const autre = await t.f.club("Bron");
      const base = { clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, saisonId: m.s26.id, date: "2026-11-15", statut: "prevu" };
      expect((await t.appel(p.libre)("POST", "/matchs", { ...base, clubDom: m.mions.id, clubExt: autre.id, equipeDomId: undefined })).statut).toBe(403);
      expect((await t.appel(p.courant)("POST", "/matchs", { ...base, saisonId: m.s24.id })).statut).toBe(404);
      expect((await t.appel(p.courant)("POST", "/matchs", { ...base, saisonId: undefined, date: "2024-12-01" })).statut).toBe(404);   // date d'une saison fermee
      expect((await t.appel(p.libre)("POST", "/matchs", base)).statut).toBe(201);
    });

    it("educateur limite a Seniors D2 : pas de match pour l'equipe U20", async () => {
      const p = await profils();
      const u20 = { clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.u20.id, saisonId: m.s26.id, date: "2026-11-22", statut: "prevu" };
      expect((await t.appel(p.seniors)("POST", "/matchs", u20)).statut).toBe(403);
      expect((await t.appel(p.seniors)("PATCH", `/matchs/${m.mU20.id}`, { heure: "15:00" })).statut).toBe(403);
      expect((await t.appel(p.seniors)("DELETE", `/matchs/${m.mU20.id}`)).statut).toBe(403);
      expect((await t.appel(p.libre)("PATCH", `/matchs/${m.mU20.id}`, { heure: "15:00" })).statut).toBe(200);
      expect((await t.appel(p.referent)("PATCH", `/matchs/${m.mU20.id}`, { heure: "16:00" })).statut).toBe(200);
    });

    it("modifier ou supprimer : seulement un match de mon club ; une modification ne le fait pas changer de club", async () => {
      const p = await profils();
      const autre = await t.f.club("Bron");
      const etranger = await t.f.match({ clubDom: m.mions.id, clubExt: autre.id, saisonId: m.s26.id, date: "2026-10-18", statut: "prevu" } as any);
      expect((await t.appel(p.libre)("PATCH", `/matchs/${etranger.id}`, { heure: "15:00" })).statut).toBe(403);
      expect((await t.appel(p.libre)("DELETE", `/matchs/${etranger.id}`)).statut).toBe(403);
      expect((await t.appel(p.libre)("PATCH", `/matchs/${m.m26.id}`, { clubDom: m.mions.id, clubExt: autre.id })).statut).toBe(403);
      expect((await t.appel(p.courant)("PATCH", `/matchs/${m.m24.id}`, { heure: "15:00" })).statut).toBe(404);          // saison fermee
      expect((await t.appel(p.admin)("PATCH", `/matchs/${etranger.id}`, { heure: "15:00" })).statut).toBe(200);
      expect((await t.appel(p.libre)("DELETE", `/matchs/${m.m26.id}`)).statut).toBe(200);
    });
  });

  describe("joueurs", () => {
    it("fiches : les champs prives (commentaire, fatigue, morphologie) ne sortent que pour mon club ; l'admin voit tout", async () => {
      const p = await profils();
      const liste = async (c: { jeton: string }) => (await t.appel(c)("GET", "/joueurs")).corps as any[];
      const mien = (l: any[]) => l.find((j) => j.id === m.joueurOl.id);
      const adverse = (l: any[]) => l.find((j) => j.id === m.joueurMions.id);

      const vuParLibre = await liste(p.libre);
      expect(mien(vuParLibre)).toMatchObject({ commentaire: "gaucher, rapide", tailleCm: 181 });
      expect(adverse(vuParLibre)).toMatchObject({ nom: "MARTIN", buts: 2, commentaire: null, tailleCm: null, scoreFatigue: null });
      expect(adverse(await liste(p.admin))).toMatchObject({ commentaire: "note privee de Mions", tailleCm: 178 });

      expect((await t.appel(p.libre)("GET", `/joueurs/${m.joueurMions.id}`)).corps.commentaire).toBeNull();
      expect((await t.appel(p.libre)("GET", `/joueurs/${m.joueurOl.id}`)).corps.commentaire).toBe("gaucher, rapide");
      const trouves = (await t.appel(p.libre)("GET", "/joueurs/search?q=martin")).corps as any[];
      expect(trouves.find((j) => j.id === m.joueurMions.id)?.commentaire).toBeNull();
    });

    it("effectif et championnat : equipe d'une saison fermee ou equipe de mon club non attribuee = 404 ; equipe adverse lisible, sans ses champs prives", async () => {
      const p = await profils();
      expect((await t.appel(p.courant)("GET", `/joueurs/effectif?equipeId=${m.sen25.id}`)).statut).toBe(404);
      expect((await t.appel(p.seniors)("GET", `/joueurs/effectif?equipeId=${m.u20.id}`)).statut).toBe(404);
      expect((await t.appel(p.courant)("GET", `/joueurs/championnat?equipeId=${m.sen25.id}`)).statut).toBe(404);
      expect((await t.appel(p.seniors)("GET", `/joueurs/effectif?equipeId=${m.sen26.id}`)).statut).toBe(200);
      const adverse = await t.appel(p.seniors)("GET", `/joueurs/effectif?equipeId=${m.mionsSen26.id}`);
      expect(adverse.statut).toBe(200);
      for (const j of adverse.corps as any[]) expect(j.commentaire ?? null).toBeNull();
    });

    it("parcours et derniers matchs : les saisons fermees n'y figurent pas", async () => {
      const p = await profils();
      await t.f.compo({ matchId: m.m24.id, cote: "dom", nom: "DURAND", prenom: "Luc" } as any);
      await t.f.compo({ matchId: m.m26.id, cote: "dom", nom: "DURAND", prenom: "Luc" } as any);
      const saisonsDe = async (c: { jeton: string }) => ((await t.appel(c)("GET", `/joueurs/${m.joueurOl.id}/historique`)).corps as any[]).map((h) => h.saisonId).sort();
      expect(await saisonsDe(p.libre)).toEqual([m.s24.id, m.s26.id].sort());
      expect(await saisonsDe(p.courant)).toEqual([m.s26.id]);

      const matchsDe = async (c: { jeton: string }, q = "") => ((await t.appel(c)("GET", `/joueurs/${m.joueurOl.id}/matchs${q}`)).corps as any[]).map((x) => x.matchId).sort();
      expect(await matchsDe(p.libre)).toEqual([m.m24.id, m.m26.id].sort());
      expect(await matchsDe(p.courant)).toEqual([m.m26.id]);
      expect(await matchsDe(p.courant, `?saisonId=${m.s24.id}`)).toEqual([]);
    });

    it("effectif de l'equipe : attacher, detacher et creer un joueur seulement dans une equipe que je gere", async () => {
      const p = await profils();
      expect((await t.appel(p.seniors)("POST", `/joueurs/equipe/${m.sen26.id}/attach/${m.joueurOl.id}`)).statut).toBe(201);
      expect((await t.appel(p.seniors)("POST", `/joueurs/equipe/${m.u20.id}/attach/${m.joueurOl.id}`)).statut).toBe(403);
      expect((await t.appel(p.seniors)("POST", `/joueurs/equipe/${m.mionsSen26.id}/attach/${m.joueurOl.id}`)).statut).toBe(403);
      expect((await t.appel(p.seniors)("DELETE", `/joueurs/equipe/${m.mionsSen26.id}/attach/${m.joueurOl.id}`)).statut).toBe(403);
      expect((await t.appel(p.courant)("POST", `/joueurs/equipe/${m.sen25.id}/attach/${m.joueurOl.id}`)).statut).toBe(404);
      expect((await t.appel(p.seniors)("DELETE", `/joueurs/equipe/${m.sen26.id}/attach/${m.joueurOl.id}`)).statut).toBe(200);

      // Un joueur cree dans mon equipe est de mon club, quoi que dise la requete.
      const cree = await t.appel(p.seniors)("POST", `/joueurs/equipe/${m.sen26.id}/create`, { nom: "NOUVEAU", clubId: m.mions.id });
      expect(cree.statut).toBe(201);
      expect(cree.corps.clubId).toBe(m.ol.id);
      expect((await t.appel(p.seniors)("POST", `/joueurs/equipe/${m.u20.id}/create`, { nom: "AUTRE" })).statut).toBe(403);
    });

    it("creer, modifier, supprimer un joueur : seulement pour mon club, sans le faire passer a un autre club ; stats saisies : equipe geree", async () => {
      const p = await profils();
      expect((await t.appel(p.libre)("POST", "/joueurs", { nom: "X", clubId: m.mions.id })).statut).toBe(403);
      expect((await t.appel(p.libre)("POST", "/joueurs", { nom: "Y", clubId: m.ol.id })).statut).toBe(201);
      expect((await t.appel(p.libre)("PATCH", `/joueurs/${m.joueurMions.id}`, { poste: "DC" })).statut).toBe(403);
      expect((await t.appel(p.libre)("DELETE", `/joueurs/${m.joueurMions.id}`)).statut).toBe(403);
      expect((await t.appel(p.libre)("PATCH", `/joueurs/${m.joueurOl.id}`, { clubId: m.mions.id })).statut).toBe(403);
      expect((await t.appel(p.libre)("PATCH", `/joueurs/${m.joueurOl.id}`, { poste: "DC" })).statut).toBe(200);
      expect((await t.appel(p.admin)("PATCH", `/joueurs/${m.joueurMions.id}`, { poste: "DC" })).statut).toBe(200);
      expect((await t.appel(p.seniors)("PUT", `/joueurs/${m.joueurOl.id}/stats-equipe/${m.u20.id}`, { buts: 2 })).statut).toBe(403);
      expect((await t.appel(p.seniors)("PUT", `/joueurs/${m.joueurOl.id}/stats-equipe/${m.sen26.id}`, { buts: 2 })).statut).toBe(200);
      expect((await t.appel(p.libre)("DELETE", `/joueurs/${m.joueurOl.id}`)).statut).toBe(200);
    });
  });

  describe("blessures (donnee de sante)", () => {
    it("liste : seulement les joueurs de mon club, hors saisons fermees ; l'admin voit tout", async () => {
      const p = await profils();
      const ids2 = async (c: { jeton: string }) => ids(await t.appel(c)("GET", "/blessures"));
      expect(await ids2(p.admin)).toEqual([m.blessure26.id, m.blessure24.id, m.blessureMions.id].sort());
      expect(await ids2(p.libre)).toEqual([m.blessure26.id, m.blessure24.id].sort());
      expect(await ids2(p.courant)).toEqual([m.blessure26.id]);
    });

    it("lecture, creation, modification, suppression : joueur de mon club et saison ouverte", async () => {
      const p = await profils();
      expect((await t.appel(p.libre)("GET", `/blessures/${m.blessureMions.id}`)).statut).toBe(403);
      expect((await t.appel(p.courant)("GET", `/blessures/${m.blessure24.id}`)).statut).toBe(404);
      expect((await t.appel(p.libre)("GET", `/blessures/${m.blessure24.id}`)).statut).toBe(200);

      const neuve = { joueurId: m.joueurOl.id, joueurNom: "DURAND Luc", localisation: "Dos", dateDebut: "2026-10-02", statut: "Indisponible", forcer: true };
      expect((await t.appel(p.libre)("POST", "/blessures", { ...neuve, joueurId: m.joueurMions.id })).statut).toBe(403);
      expect((await t.appel(p.courant)("POST", "/blessures", { ...neuve, dateDebut: "2024-10-02" })).statut).toBe(404);
      const creee = await t.appel(p.libre)("POST", "/blessures", neuve);
      expect(creee.statut).toBe(201);
      expect((await t.appel(p.libre)("PATCH", `/blessures/${creee.corps.id}`, { ...neuve, joueurId: m.joueurMions.id })).statut).toBe(403);
      expect((await t.appel(p.libre)("PATCH", `/blessures/${m.blessureMions.id}`, { ...neuve, details: "x" })).statut).toBe(403);
      expect((await t.appel(p.libre)("DELETE", `/blessures/${m.blessureMions.id}`)).statut).toBe(403);
      expect((await t.appel(p.libre)("DELETE", `/blessures/${creee.corps.id}`)).statut).toBe(200);
    });
  });

  describe("entrainements et plans de jeu (prives a l'equipe)", () => {
    it("liste : seulement les equipes que je gere (educateur limite a Seniors D2 : pas la U20), jamais celles d'un autre club", async () => {
      const p = await profils();
      const l = async (c: { jeton: string }, q = "") => ids(await t.appel(c)("GET", `/entrainements${q}`));
      expect(await l(p.admin)).toEqual([m.seanceSen26.id, m.seanceU20.id, m.seanceSen25.id, m.seanceMions.id].sort());
      expect(await l(p.libre)).toEqual([m.seanceSen26.id, m.seanceU20.id, m.seanceSen25.id].sort());
      expect(await l(p.seniors)).toEqual([m.seanceSen26.id, m.seanceSen25.id].sort());              // Seniors D2, aussi sur la saison precedente
      expect(await l(p.courant)).toEqual([m.seanceSen26.id, m.seanceU20.id].sort());
      expect((await t.appel(p.libre)("GET", `/entrainements?equipeId=${m.mionsSen26.id}`)).statut).toBe(403);
      expect((await t.appel(p.seniors)("GET", `/entrainements?equipeId=${m.u20.id}`)).statut).toBe(403);
      expect((await t.appel(p.courant)("GET", `/entrainements?equipeId=${m.sen25.id}`)).statut).toBe(404);
    });

    it("lecture, creation, modification, suppression d'une seance : equipe geree, jamais d'equipe d'un autre club ni transfert", async () => {
      const p = await profils();
      expect((await t.appel(p.libre)("GET", `/entrainements/${m.seanceMions.id}`)).statut).toBe(403);
      expect((await t.appel(p.seniors)("GET", `/entrainements/${m.seanceU20.id}`)).statut).toBe(403);
      expect((await t.appel(p.seniors)("GET", `/entrainements/${m.seanceSen26.id}`)).statut).toBe(200);
      const seance = { equipeId: m.sen26.id, date: "2026-10-05", type: "Tactique", dureeMin: 90, intensite: 5 };
      expect((await t.appel(p.seniors)("POST", "/entrainements", { ...seance, equipeId: m.u20.id })).statut).toBe(403);
      expect((await t.appel(p.libre)("POST", "/entrainements", { ...seance, equipeId: m.mionsSen26.id })).statut).toBe(403);
      expect((await t.appel(p.libre)("POST", "/entrainements", { date: "2026-10-05" })).statut).toBe(400);               // equipeId obligatoire
      const creee = await t.appel(p.seniors)("POST", "/entrainements", seance);
      expect(creee.statut).toBe(201);
      expect((await t.appel(p.seniors)("PATCH", `/entrainements/${creee.corps.id}`, { equipeId: m.u20.id })).statut).toBe(403);
      expect((await t.appel(p.seniors)("PATCH", `/entrainements/${m.seanceU20.id}`, { theme: "x" })).statut).toBe(403);
      expect((await t.appel(p.seniors)("PATCH", `/entrainements/${creee.corps.id}`, { theme: "pressing" })).statut).toBe(200);
      expect((await t.appel(p.libre)("DELETE", `/entrainements/${m.seanceMions.id}`)).statut).toBe(403);
      expect((await t.appel(p.seniors)("DELETE", `/entrainements/${creee.corps.id}`)).statut).toBe(200);
    });

    it("plan de jeu : lecture et ecriture seulement pour une equipe que je gere ; l'admin passe partout", async () => {
      const p = await profils();
      const plan = (equipeId: string) => ({ equipeId, formation: "4-3-3", titulaires: [], remplacants: [] });
      expect((await t.appel(p.seniors)("GET", `/tactiques?equipeId=${m.sen26.id}`)).statut).toBe(200);
      expect((await t.appel(p.seniors)("GET", `/tactiques?equipeId=${m.u20.id}`)).statut).toBe(403);
      expect((await t.appel(p.libre)("GET", `/tactiques?equipeId=${m.mionsSen26.id}`)).statut).toBe(403);
      expect((await t.appel(p.courant)("GET", `/tactiques?equipeId=${m.sen25.id}`)).statut).toBe(404);
      expect((await t.appel(p.libre)("GET", `/tactiques/comparaison?equipeId=${m.mionsSen26.id}`)).statut).toBe(403);
      expect((await t.appel(p.libre)("GET", `/tactiques?equipeId=${m.sen26.id}&matchId=${m.m24.id}`)).statut).toBe(200);
      expect((await t.appel(p.courant)("GET", `/tactiques?equipeId=${m.sen26.id}&matchId=${m.m24.id}`)).statut).toBe(404);   // match d'une saison fermee
      expect((await t.appel(p.seniors)("PUT", "/tactiques", plan(m.u20.id))).statut).toBe(403);
      expect((await t.appel(p.libre)("PUT", "/tactiques", plan(m.mionsSen26.id))).statut).toBe(403);
      expect((await t.appel(p.libre)("DELETE", `/tactiques?equipeId=${m.mionsSen26.id}`)).statut).toBe(403);
      expect((await t.appel(p.admin)("GET", `/tactiques?equipeId=${m.mionsSen26.id}`)).statut).toBe(200);
    });
  });

  describe("scouting, bilans et analyses", () => {
    it("rapports de scouting : ceux dates d'une saison fermee ne sortent pas, et on n'en cree pas dedans", async () => {
      const p = await profils();
      const repo = t.ds.getRepository(RapportScouting);
      const vieux = await repo.save(repo.create({ clubId: m.mions.id, equipeNom: "Mions", date: "2024-10-01" }));
      const recent = await repo.save(repo.create({ clubId: m.mions.id, equipeNom: "Mions", date: "2026-10-01" }));
      expect(ids(await t.appel(p.libre)("GET", `/scouting?clubId=${m.mions.id}`))).toEqual([vieux.id, recent.id].sort());
      expect(ids(await t.appel(p.courant)("GET", `/scouting?clubId=${m.mions.id}`))).toEqual([recent.id]);
      expect((await t.appel(p.courant)("GET", `/scouting/${vieux.id}`)).statut).toBe(404);
      expect((await t.appel(p.courant)("GET", `/scouting/${recent.id}`)).statut).toBe(200);
      expect((await t.appel(p.courant)("GET", `/scouting?saisonId=${m.s24.id}`)).corps).toEqual([]);
      expect((await t.appel(p.courant)("GET", `/scouting/club/${m.mions.id}`)).corps.id).toBe(recent.id);
      expect((await t.appel(p.courant)("POST", "/scouting", { clubId: m.mions.id, equipeNom: "Mions", date: "2024-11-01" })).statut).toBe(404);
      expect((await t.appel(p.courant)("PATCH", `/scouting/${vieux.id}`, { clubId: m.mions.id, equipeNom: "Mions", bilan: "x" })).statut).toBe(404);
      expect((await t.appel(p.courant)("DELETE", `/scouting/${vieux.id}`)).statut).toBe(404);
    });

    it("bilan d'un club : saison fermee ou equipe non attribuee = 404 ; sans precision, un compte restreint n'a que la saison actuelle", async () => {
      const p = await profils();
      const joues = async (c: { jeton: string }, q = "") => (await t.appel(c)("GET", `/stats/bilan/${m.ol.id}${q}`)).corps.joues;
      expect(await joues(p.libre)).toBe(3);                                       // 3 saisons melangees
      expect(await joues(p.courant)).toBe(1);                                     // la saison actuelle seulement
      expect(await joues(p.restreint, `?saisonId=${m.s25.id}`)).toBe(1);          // une saison cochee se demande
      expect((await t.appel(p.courant)("GET", `/stats/bilan/${m.ol.id}?saisonId=${m.s24.id}`)).statut).toBe(404);
      expect((await t.appel(p.courant)("GET", `/stats/bilan/${m.ol.id}?equipeId=${m.sen25.id}`)).statut).toBe(404);
      expect((await t.appel(p.seniors)("GET", `/stats/bilan/${m.ol.id}?equipeId=${m.u20.id}`)).statut).toBe(404);
    });

    it("analyses (rapport, situation, poule, pre-match) : memes regles de saison et d'equipe", async () => {
      const p = await profils();
      const c = t.appel(p.courant);
      expect((await c("GET", `/analyse/club/${m.mions.id}`)).statut).toBe(200);
      expect((await c("GET", `/analyse/club/${m.mions.id}?saisonId=${m.s24.id}`)).statut).toBe(404);
      expect((await c("GET", `/analyse/club/${m.mions.id}/situation?saisonId=${m.s24.id}`)).statut).toBe(404);
      expect((await c("GET", `/analyse/club/${m.mions.id}/situation`)).statut).toBe(200);
      expect((await c("GET", `/analyse/poule?equipeId=${m.sen25.id}`)).statut).toBe(404);
      expect((await c("GET", `/analyse/poule?equipeId=${m.sen26.id}`)).statut).toBe(200);
      expect((await c("GET", `/analyse/prematch?equipeId=${m.sen25.id}&adversaireId=${m.mions.id}`)).statut).toBe(404);
      expect((await c("GET", `/analyse/prematch?equipeId=${m.sen26.id}&adversaireId=${m.mions.id}&matchId=${m.m24.id}`)).statut).toBe(404);
      expect((await t.appel(p.seniors)("GET", `/analyse/poule?equipeId=${m.u20.id}`)).statut).toBe(404);
      expect((await t.appel(p.libre)("GET", `/analyse/club/${m.mions.id}?saisonId=${m.s24.id}`)).statut).toBe(200);
    });
  });

  describe("arbitres, entraineurs, clubs, administration", () => {
    it("arbitre : detail par saison et matchs arbitres des saisons fermees retires (liste et fiche)", async () => {
      const p = await profils();
      const repo = t.ds.getRepository(Arbitre);
      const part = (saison: { id: string; nom: string }, annee: number) => ({ saisonId: saison.id, saisonNom: saison.nom, anneeDebut: annee, matchsOfficies: 1 });
      const arbitre = await repo.save(repo.create({ nom: "BLANC", prenom: "Eric", matchsOfficies: 2, participations: JSON.stringify([part(m.s26, 2026), part(m.s24, 2024)]) }));
      const liens = t.ds.getRepository(ArbitreMatch);
      for (const match of [m.m24, m.m26]) await liens.save(liens.create({ matchId: match.id, arbitreId: arbitre.id, role: "principal" }));

      const fiche = async (c: { jeton: string }) => (await t.appel(c)("GET", `/arbitres/${arbitre.id}`)).corps;
      expect((await fiche(p.libre)).participations).toHaveLength(2);
      expect((await fiche(p.libre)).liensMatchs).toHaveLength(2);
      const restreinte = await fiche(p.courant);
      expect(restreinte.participations.map((x: any) => x.saisonId)).toEqual([m.s26.id]);
      expect(restreinte.liensMatchs.map((l: any) => l.matchId)).toEqual([m.m26.id]);
      expect(restreinte.matchsOfficies).toBe(2);                                 // total de carriere : non decoupable, conserve
      const liste = (await t.appel(p.courant)("GET", "/arbitres")).corps.find((a: any) => a.id === arbitre.id);
      expect(JSON.parse(liste.participations).map((x: any) => x.saisonId)).toEqual([m.s26.id]);
    });

    it("arbitre : tout compte en cree un depuis la fiche d'un match ; renommer ou supprimer, admin seulement ; liens sur un match de mon club", async () => {
      const p = await profils();
      const cree = await t.appel(p.libre)("POST", "/arbitres", { nom: "NOIR", prenom: "Paul" });
      expect(cree.statut).toBe(201);
      expect((await t.appel(p.libre)("PATCH", `/arbitres/${cree.corps.id}`, { nom: "X" })).statut).toBe(403);
      expect((await t.appel(p.libre)("DELETE", `/arbitres/${cree.corps.id}`)).statut).toBe(403);

      const autre = await t.f.club("Bron");
      const etranger = await t.f.match({ clubDom: m.mions.id, clubExt: autre.id, saisonId: m.s26.id, date: "2026-10-18", statut: "prevu" } as any);
      const lien = { arbitreId: cree.corps.id, role: "principal" };
      expect((await t.appel(p.libre)("POST", "/arbitres/link", { ...lien, matchId: etranger.id })).statut).toBe(403);
      expect((await t.appel(p.courant)("POST", "/arbitres/link", { ...lien, matchId: m.m24.id })).statut).toBe(404);
      const ok = await t.appel(p.libre)("POST", "/arbitres/link", { ...lien, matchId: m.m26.id });
      expect(ok.statut).toBe(201);
      expect((await t.appel(p.libre)("GET", `/arbitres/match/${m.m26.id}`)).statut).toBe(200);
      expect((await t.appel(p.courant)("GET", `/arbitres/match/${m.m24.id}`)).statut).toBe(404);
      expect((await t.appel(p.libre)("PATCH", `/arbitres/link/${ok.corps.id}`, { note: 7 })).statut).toBe(200);
      expect((await t.appel(p.libre)("DELETE", `/arbitres/link/${ok.corps.id}`)).statut).toBe(200);
      expect((await t.appel(p.admin)("DELETE", `/arbitres/${cree.corps.id}`)).statut).toBe(200);
    });

    it("entraineur : fiche sans les matchs des saisons fermees ; creation, modification et liens pour mon club seulement", async () => {
      const p = await profils();
      const coachs = t.ds.getRepository(Coach);
      const coach = await coachs.save(coachs.create({ nom: "LEROY", prenom: "Marc", clubId: m.ol.id }));
      const adverse = await coachs.save(coachs.create({ nom: "GRIS", prenom: "Tom", clubId: m.mions.id }));
      const staff = t.ds.getRepository(StaffMatch);
      for (const match of [m.m24, m.m26]) await staff.save(staff.create({ matchId: match.id, coachId: coach.id, cote: "dom", fonctions: "E" }));

      const fiche = async (c: { jeton: string }) => (await t.appel(c)("GET", `/coachs/${coach.id}/fiche`)).corps;
      expect((await fiche(p.libre)).matchs).toHaveLength(2);
      const restreinte = await fiche(p.courant);
      expect(restreinte.matchs.map((x: any) => x.matchId)).toEqual([m.m26.id]);
      expect(restreinte.parSaison).toHaveLength(1);
      expect((await t.appel(p.courant)("GET", `/coachs/${coach.id}/fiche?saisonId=${m.s24.id}`)).statut).toBe(404);
      expect((await t.appel(p.courant)("GET", `/coachs/${coach.id}`)).corps.participations).toHaveLength(1);

      expect((await t.appel(p.libre)("POST", "/coachs", { nom: "NEUF", clubId: m.mions.id })).statut).toBe(403);
      expect((await t.appel(p.libre)("POST", "/coachs", { nom: "NEUF", clubId: m.ol.id })).statut).toBe(201);
      expect((await t.appel(p.libre)("PATCH", `/coachs/${adverse.id}`, { prenom: "x" })).statut).toBe(403);
      expect((await t.appel(p.libre)("DELETE", `/coachs/${adverse.id}`)).statut).toBe(403);
      expect((await t.appel(p.libre)("PATCH", `/coachs/${coach.id}`, { clubId: m.mions.id })).statut).toBe(403);
      expect((await t.appel(p.libre)("PATCH", `/coachs/${coach.id}`, { prenom: "Marcel" })).statut).toBe(200);
      expect((await t.appel(p.courant)("POST", "/coachs/link", { matchId: m.m24.id, coachId: coach.id, cote: "dom" })).statut).toBe(404);
      expect((await t.appel(p.libre)("GET", `/coachs/match/${m.m26.id}`)).statut).toBe(200);
    });

    it("clubs : tout compte ajoute un club adverse ; modifier = admin ou referent du club ; supprimer = admin", async () => {
      const p = await profils();
      const cree = await t.appel(p.libre)("POST", "/clubs", { nom: "Bron FC" });
      expect(cree.statut).toBe(201);
      expect((await t.appel(p.libre)("PATCH", `/clubs/${m.ol.id}`, { nom: "OL Sud", ville: "Lyon" })).statut).toBe(403);
      expect((await t.appel(p.referent)("PATCH", `/clubs/${m.ol.id}`, { nom: "OL Sud", ville: "Lyon" })).statut).toBe(200);
      expect((await t.appel(p.referent)("PATCH", `/clubs/${m.mions.id}`, { nom: "Mions", ville: "Mions" })).statut).toBe(403);
      expect((await t.appel(p.admin)("PATCH", `/clubs/${m.mions.id}`, { nom: "Mions", ville: "Mions" })).statut).toBe(200);
      expect((await t.appel(p.referent)("DELETE", `/clubs/${cree.corps.id}`)).statut).toBe(403);
      expect((await t.appel(p.admin)("DELETE", `/clubs/${cree.corps.id}`)).statut).toBe(200);
    });

    it("reinitialisation de la base (seed) : administrateur seulement", async () => {
      const p = await profils();
      for (const c of [p.referent, p.libre, p.restreint]) expect((await t.appel(c)("POST", "/seed/reset")).statut).toBe(403);
      expect((await t.appel(undefined)("POST", "/seed/reset")).statut).toBe(401);
    });
  });
});
