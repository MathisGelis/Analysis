import { DataSource } from "typeorm";
import { Composition, Equipe, EvenementMatch, Joueur, Match, Saison } from "@/entities";
import { creerBaseTest, fabriques } from "@/testing/test-db";
import { JoueursService } from "./joueurs.module";

describe("JoueursService", () => {
  let ds: DataSource;
  let svc: JoueursService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    svc = new JoueursService(
      ds.getRepository(Joueur), ds.getRepository(Composition), ds.getRepository(Match),
      ds.getRepository(EvenementMatch), ds.getRepository(Equipe), ds.getRepository(Saison),
    );
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  /** Contexte type : mon club (deux equipes) contre un adversaire, saison 25-26. */
  async function contexte() {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse");
    const saison = await f.saison("2025-2026", 2025, { actif: true });
    const seniors = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: saison.id });
    const u20 = await f.equipe({ clubId: moi.id, nom: "U20", categorie: "U20", saisonId: saison.id });
    const advEq = await f.equipe({ clubId: adv.id, nom: "Adverse Seniors", categorie: "Seniors", saisonId: saison.id });
    return { moi, adv, saison, seniors, u20, advEq };
  }

  describe("effectif", () => {
    it("404 si l'equipe n'existe pas", async () => {
      await expect(svc.effectif("inconnue")).rejects.toThrow(/introuvable/);
    });

    it("compte les stats UNIQUEMENT sur les matchs de cette equipe", async () => {
      const c = await contexte();
      const j = { nom: "MARCON", prenom: "Leo", licence: "111" };
      const mSeniors1 = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
      const mSeniors2 = await f.match({ clubDom: c.adv.id, clubExt: c.moi.id, equipeDomId: c.advEq.id, equipeExtId: c.seniors.id, saisonId: c.saison.id });
      const mU20 = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.u20.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
      await f.compo({ matchId: mSeniors1.id, cote: "dom", ...j, minutes: 90 });
      await f.compo({ matchId: mSeniors2.id, cote: "ext", ...j, minutes: 60 });
      await f.compo({ matchId: mU20.id, cote: "dom", ...j, minutes: 90 });

      const seniors = await svc.effectif(c.seniors.id);
      const u20 = await svc.effectif(c.u20.id);

      expect(seniors).toHaveLength(1);
      expect(seniors[0]).toMatchObject({ nom: "MARCON", matchs: 2, titularisations: 2, minutes: 150, equipeNom: "Seniors" });
      expect(u20[0]).toMatchObject({ nom: "MARCON", matchs: 1, minutes: 90, equipeNom: "U20" });
    });

    it("ignore les compositions de l'adversaire", async () => {
      const c = await contexte();
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
      await f.compo({ matchId: m.id, cote: "dom", nom: "AMI", prenom: "Paul" });
      await f.compo({ matchId: m.id, cote: "ext", nom: "ADVERSAIRE", prenom: "Marc" });

      const rows = await svc.effectif(c.seniors.id);

      expect(rows.map((r) => r.nom)).toEqual(["AMI"]);
    });

    it("distingue deux equipes d'un MEME club dans un match de coupe", async () => {
      const c = await contexte();
      const seniors2 = await f.equipe({ clubId: c.moi.id, nom: "Seniors 2", categorie: "Seniors", saisonId: c.saison.id });
      const derby = await f.match({ clubDom: c.moi.id, clubExt: c.moi.id, equipeDomId: c.seniors.id, equipeExtId: seniors2.id, saisonId: c.saison.id });
      await f.compo({ matchId: derby.id, cote: "dom", nom: "PREMIER", prenom: "A" });
      await f.compo({ matchId: derby.id, cote: "ext", nom: "SECOND", prenom: "B" });

      expect((await svc.effectif(c.seniors.id)).map((r) => r.nom)).toEqual(["PREMIER"]);
      expect((await svc.effectif(seniors2.id)).map((r) => r.nom)).toEqual(["SECOND"]);
    });

    it("attribue buts, passes et cartons de son cote seulement", async () => {
      const c = await contexte();
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
      await f.compo({ matchId: m.id, cote: "dom", nom: "BUTEUR", prenom: "Ali" });
      await f.compo({ matchId: m.id, cote: "dom", nom: "PASSEUR", prenom: "Bob", numero: 2 });
      await f.evenement({ matchId: m.id, type: "but", equipe: "dom", joueur: "BUTEUR Ali", joueur2: "PASSEUR Bob", minute: 10 });
      await f.evenement({ matchId: m.id, type: "carton", sousType: "jaune", equipe: "dom", joueur: "BUTEUR Ali", minute: 50 });
      // Meme patronyme cote adverse : ne doit rien compter pour moi.
      await f.evenement({ matchId: m.id, type: "but", equipe: "ext", joueur: "BUTEUR Ali", minute: 70 });

      const rows = await svc.effectif(c.seniors.id);
      const buteur = rows.find((r) => r.nom === "BUTEUR");
      const passeur = rows.find((r) => r.nom === "PASSEUR");

      expect(buteur).toMatchObject({ buts: 1, cartonsJaunes: 1, cartonsRouges: 0 });
      expect(passeur).toMatchObject({ passesDecisives: 1, buts: 0 });
    });

    it("un remplacant non entre en jeu apparait avec 0 match ; entre a la 70e, il compte 20 min", async () => {
      const c = await contexte();
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
      await f.compo({ matchId: m.id, cote: "dom", nom: "BANC", prenom: "X", titulaire: false, minutes: 0 });
      await f.compo({ matchId: m.id, cote: "dom", nom: "ENTRANT", prenom: "Y", titulaire: false, minutes: 0, numero: 14 });
      await f.evenement({ matchId: m.id, type: "remplacement", equipe: "dom", joueur: "SORTANT Z", joueur2: "ENTRANT Y", minute: 70 });

      const rows = await svc.effectif(c.seniors.id);

      expect(rows.find((r) => r.nom === "BANC")).toMatchObject({ matchs: 0, minutes: 0 });
      expect(rows.find((r) => r.nom === "ENTRANT")).toMatchObject({ matchs: 1, titularisations: 0, minutes: 20 });
    });

    it("saison sans FMI : les joueurs attaches manuellement apparaissent a 0, les autres non", async () => {
      const c = await contexte();
      const s26 = await f.saison("2026-2027", 2026);
      const eq26 = await f.equipe({ clubId: c.moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s26.id });
      const attache = await f.joueur({ nom: "ATTACHE", prenom: "Nico", clubId: c.moi.id, equipesAttachees: [eq26.id] });
      await f.joueur({ nom: "AILLEURS", prenom: "Zed", clubId: c.moi.id, equipesAttachees: [c.seniors.id] });

      const rows = await svc.effectif(eq26.id);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: attache.id, nom: "ATTACHE", matchs: 0, minutes: 0, cartonsJaunes: 0, equipeId: eq26.id,
      });
    });

    it("un joueur attache ET deja aligne n'est pas duplique", async () => {
      const c = await contexte();
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
      await f.joueur({ nom: "DOUBLE", prenom: "Dan", clubId: c.moi.id, equipesAttachees: [c.seniors.id] });
      await f.compo({ matchId: m.id, cote: "dom", nom: "DOUBLE", prenom: "Dan" });

      const rows = await svc.effectif(c.seniors.id);

      expect(rows).toHaveLength(1);
      expect(rows[0].matchs).toBe(1);
    });

    it("scoreForme : renvoye sur la saison active, masque sur une autre", async () => {
      const c = await contexte();
      const s24 = await f.saison("2024-2025", 2024);
      const eqPassee = await f.equipe({ clubId: c.moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s24.id });
      await f.joueur({ nom: "FORME", prenom: "Fab", clubId: c.moi.id, scoreForme: 80, equipesAttachees: [c.seniors.id, eqPassee.id] });

      expect((await svc.effectif(c.seniors.id))[0].scoreForme).toBe(80);
      expect((await svc.effectif(eqPassee.id))[0].scoreForme).toBeNull();
    });
  });

  describe("historique", () => {
    it("un joueur qui change de club dans la MEME saison a deux lignes distinctes", async () => {
      const c = await contexte();
      const autre = await f.club("Autre club");
      const autreEq = await f.equipe({ clubId: autre.id, nom: "Autre Seniors", categorie: "Seniors", saisonId: c.saison.id });
      const j = await f.joueur({ nom: "MUTE", prenom: "Tom", licence: "999", clubId: autre.id });
      const m1 = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
      const m2 = await f.match({ clubDom: autre.id, clubExt: c.adv.id, equipeDomId: autreEq.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
      await f.compo({ matchId: m1.id, cote: "dom", nom: "MUTE", prenom: "Tom", licence: "999", minutes: 90 });
      await f.compo({ matchId: m2.id, cote: "dom", nom: "MUTE", prenom: "Tom", licence: "999", minutes: 45, titulaire: false });

      const h = await svc.historique(j.id);

      expect(h).toHaveLength(1);
      expect(h[0].lignes).toHaveLength(2);
      expect(h[0].lignes.map((l: any) => l.clubId).sort()).toEqual([autre.id, c.moi.id].sort());
      const chezMoi = h[0].lignes.find((l: any) => l.clubId === c.moi.id);
      expect(chezMoi).toMatchObject({ matchs: 1, titularisations: 1, minutes: 90, equipeNom: "Seniors" });
    });

    it("groupe par saison, la plus recente d'abord", async () => {
      const c = await contexte();
      const s24 = await f.saison("2024-2025", 2024);
      const eq24 = await f.equipe({ clubId: c.moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s24.id });
      const j = await f.joueur({ nom: "FIDELE", prenom: "Ben", licence: "42", clubId: c.moi.id });
      const m24 = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: eq24.id, saisonId: s24.id });
      const m25 = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, saisonId: c.saison.id });
      await f.compo({ matchId: m24.id, cote: "dom", nom: "FIDELE", prenom: "Ben", licence: "42" });
      await f.compo({ matchId: m25.id, cote: "dom", nom: "FIDELE", prenom: "Ben", licence: "42" });

      const h = await svc.historique(j.id);

      expect(h.map((s) => s.saisonNom)).toEqual(["2025-2026", "2024-2025"]);
    });

    it("ajoute une ligne a 0 pour une equipe attachee sans match (saison future)", async () => {
      const c = await contexte();
      const s26 = await f.saison("2026-2027", 2026);
      const eq26 = await f.equipe({ clubId: c.moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s26.id });
      const j = await f.joueur({ nom: "PREPARE", prenom: "Ugo", licence: "7", clubId: c.moi.id, equipesAttachees: [eq26.id] });
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, saisonId: c.saison.id });
      await f.compo({ matchId: m.id, cote: "dom", nom: "PREPARE", prenom: "Ugo", licence: "7" });

      const h = await svc.historique(j.id);

      expect(h.map((s) => s.saisonNom)).toEqual(["2026-2027", "2025-2026"]);
      expect(h[0].lignes[0]).toMatchObject({ equipeId: eq26.id, matchs: 0, minutes: 0 });
    });

    it("n'ajoute pas de ligne a 0 si l'equipe attachee a deja des matchs", async () => {
      const c = await contexte();
      const j = await f.joueur({ nom: "DEJAJOUE", prenom: "Eve", licence: "8", clubId: c.moi.id, equipesAttachees: [c.seniors.id] });
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, saisonId: c.saison.id });
      await f.compo({ matchId: m.id, cote: "dom", nom: "DEJAJOUE", prenom: "Eve", licence: "8" });

      const h = await svc.historique(j.id);

      expect(h[0].lignes).toHaveLength(1);
      expect(h[0].lignes[0].matchs).toBe(1);
    });

    it("un joueur JAMAIS aligne mais attache a un effectif a quand meme son parcours", async () => {
      const c = await contexte();
      const s26 = await f.saison("2026-2027", 2026);
      const eq26 = await f.equipe({ clubId: c.moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s26.id });
      const j = await f.joueur({ nom: "RECRUE", prenom: "Kim", clubId: c.moi.id, equipesAttachees: [eq26.id] });

      const h = await svc.historique(j.id);

      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ saisonNom: "2026-2027" });
      expect(h[0].lignes[0]).toMatchObject({ equipeId: eq26.id, matchs: 0 });
    });

    it("un joueur sans match ni equipe attachee : historique vide", async () => {
      const c = await contexte();
      const j = await f.joueur({ nom: "FANTOME", prenom: "Zoe", clubId: c.moi.id });
      expect(await svc.historique(j.id)).toEqual([]);
    });
  });
});
