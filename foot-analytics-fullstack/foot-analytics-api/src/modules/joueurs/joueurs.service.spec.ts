import { DataSource } from "typeorm";
import { Composition, Equipe, EvenementMatch, Joueur, Match, Saison, StatJoueurEquipe } from "@/entities";
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
      ds.getRepository(StatJoueurEquipe),
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

    it("fatigue : renvoyee sur la saison active, masquee sur une autre", async () => {
      const c = await contexte();
      const s24 = await f.saison("2024-2025", 2024);
      const eqPassee = await f.equipe({ clubId: c.moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s24.id });
      await f.joueur({ nom: "FATIGUE", prenom: "Fab", clubId: c.moi.id, scoreFatigue: 80, equipesAttachees: [c.seniors.id, eqPassee.id] });

      expect((await svc.effectif(c.seniors.id))[0].scoreFatigue).toBe(80);
      expect((await svc.effectif(eqPassee.id))[0].scoreFatigue).toBeNull();
      expect((await svc.effectif(eqPassee.id))[0].fatigueDetail).toBeNull();
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

    it("minutes deduites des remplacements (colonne non renseignee a l'import), banc = 0 match", async () => {
      const c = await contexte();
      const titu = await f.joueur({ nom: "TITU", prenom: "Ari", licence: "11", clubId: c.moi.id });
      const entrant = await f.joueur({ nom: "ENTRANT", prenom: "Bo", licence: "12", clubId: c.moi.id });
      const banc = await f.joueur({ nom: "BANC", prenom: "Cy", licence: "13", clubId: c.moi.id });
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, saisonId: c.saison.id });
      await f.compo({ matchId: m.id, cote: "dom", nom: "TITU", prenom: "Ari", licence: "11", minutes: 0 });
      await f.compo({ matchId: m.id, cote: "dom", nom: "ENTRANT", prenom: "Bo", licence: "12", titulaire: false, minutes: 0, numero: 14 });
      await f.compo({ matchId: m.id, cote: "dom", nom: "BANC", prenom: "Cy", licence: "13", titulaire: false, minutes: 0, numero: 15 });
      await f.evenement({ matchId: m.id, type: "remplacement", equipe: "dom", joueur: "TITU Ari", joueur2: "ENTRANT Bo", minute: 60 });

      const ligne = async (j: Joueur) => (await svc.historique(j.id))[0].lignes[0];

      expect(await ligne(titu)).toMatchObject({ matchs: 1, titularisations: 1, minutes: 60 });
      expect(await ligne(entrant)).toMatchObject({ matchs: 1, titularisations: 0, minutes: 30 });
      expect(await ligne(banc)).toMatchObject({ matchs: 0, titularisations: 0, minutes: 0 });
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

  /** Un joueur qui a joue deux saisons : 1 but + 1 jaune en 24-25, 2 buts + 1 passe en 25-26. */
  async function joueurSurDeuxSaisons() {
    const c = await contexte();
    const s24 = await f.saison("2024-2025", 2024);
    const eq24 = await f.equipe({ clubId: c.moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s24.id });
    const adv24 = await f.equipe({ clubId: c.adv.id, nom: "Adverse Seniors", categorie: "Seniors", saisonId: s24.id });
    const j = await f.joueur({ nom: "MARCON", prenom: "Leo", licence: "111", clubId: c.moi.id });
    const m24 = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: eq24.id, equipeExtId: adv24.id, saisonId: s24.id });
    const m25 = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id });
    for (const m of [m24, m25]) await f.compo({ matchId: m.id, cote: "dom", nom: "MARCON", prenom: "Leo", licence: "111", numero: 9 });
    await f.compo({ matchId: m25.id, cote: "dom", nom: "AMI", prenom: "Paul", licence: "222", numero: 7 });
    await f.evenement({ matchId: m24.id, type: "but", equipe: "dom", joueur: "MARCON Leo", minute: 5 });
    await f.evenement({ matchId: m24.id, type: "carton", sousType: "jaune", equipe: "dom", joueur: "MARCON Leo", minute: 60 });
    await f.evenement({ matchId: m25.id, type: "but", equipe: "dom", joueur: "MARCON Leo", minute: 10 });
    await f.evenement({ matchId: m25.id, type: "but", equipe: "dom", joueur: "MARCON Leo", minute: 20 });
    await f.evenement({ matchId: m25.id, type: "but", equipe: "dom", joueur: "AMI Paul", joueur2: "MARCON Leo", minute: 30 });
    return { c, j, eq24, s24 };
  }

  describe("stats sensibles a la saison", () => {
    it("historique : buts, passes, cartons et numeros par saison, sans melanger", async () => {
      const { j } = await joueurSurDeuxSaisons();

      const h = await svc.historique(j.id);
      const l25 = h.find((s) => s.saisonNom === "2025-2026")!.lignes[0];
      const l24 = h.find((s) => s.saisonNom === "2024-2025")!.lignes[0];

      expect(l25).toMatchObject({ buts: 2, passesDecisives: 1, cartonsJaunes: 0, numeros: { 9: 1 } });
      expect(l24).toMatchObject({ buts: 1, passesDecisives: 0, cartonsJaunes: 1, numeros: { 9: 1 } });
      expect(h.find((s) => s.saisonNom === "2025-2026")!.saisonActive).toBe(true);
      expect(h.find((s) => s.saisonNom === "2024-2025")!.saisonActive).toBe(false);
    });

    it("historique : totaux par saison (toutes equipes) avec numeros et note", async () => {
      const { j } = await joueurSurDeuxSaisons();
      const h = await svc.historique(j.id);
      const t25 = h.find((s) => s.saisonNom === "2025-2026")!.totaux;
      const t24 = h.find((s) => s.saisonNom === "2024-2025")!.totaux;
      expect(t25).toMatchObject({ matchs: 1, buts: 2, passesDecisives: 1, cartonsJaunes: 0, numeros: { 9: 1 }, noteMoyenne: 5.5 });
      expect(t24).toMatchObject({ matchs: 1, buts: 1, cartonsJaunes: 1 });
    });

    it("matchsJoues : restreint a la saison, feuille personnelle, plus recent d'abord (dates jj/mm/aaaa)", async () => {
      const { c, j } = await joueurSurDeuxSaisons();
      const match = (date: string, journee: string, dom: boolean) => f.match({
        clubDom: dom ? c.moi.id : c.adv.id, clubExt: dom ? c.adv.id : c.moi.id,
        equipeDomId: dom ? c.seniors.id : c.advEq.id, equipeExtId: dom ? c.advEq.id : c.seniors.id,
        saisonId: c.saison.id, date, journee, scoreDom: dom ? 2 : 1, scoreExt: dom ? 0 : 3,
      });
      const ancien = await match("27/09/2025", "1", false);
      const recent = await match("15/03/2026", "2", true);
      const banc = await match("10/01/2026", "3", true);
      await f.compo({ matchId: ancien.id, cote: "ext", nom: "MARCON", prenom: "Leo", licence: "111", numero: 9 });
      await f.compo({ matchId: recent.id, cote: "dom", nom: "MARCON", prenom: "Leo", licence: "111", minutes: 80, numero: 9 });
      await f.compo({ matchId: banc.id, cote: "dom", nom: "MARCON", prenom: "Leo", licence: "111", titulaire: false, minutes: 0, numero: 14 });
      await f.evenement({ matchId: recent.id, type: "but", equipe: "dom", joueur: "MARCON Leo", minute: 12 });

      const lignes = await svc.matchsJoues(j.id, c.saison.id);

      // "15/03/2026" est plus recent que "27/09/2025" bien qu'inferieur comme chaine ; le banc est ignore ;
      // le match sans date (fabrique de contexte) ferme la marche ; ceux de 24-25 sont exclus.
      expect(lignes.map((l) => l.journee)).toEqual(["2", "1", null]);
      expect(lignes[0]).toMatchObject({ matchId: recent.id, domicile: true, scoreEquipe: 2, scoreAdversaire: 0, titulaire: true, minutes: 80, buts: 1, adversaireId: c.adv.id });
      expect(lignes[1]).toMatchObject({ domicile: false, scoreEquipe: 3, scoreAdversaire: 1 });
      expect((await svc.matchsJoues(j.id)).length).toBe(4);
      expect(await svc.matchsJoues(j.id, c.saison.id, 1)).toHaveLength(1);
    });

    it("effectif d'une equipe passee : ses seuls buts et cartons", async () => {
      const { eq24 } = await joueurSurDeuxSaisons();
      const rows = await svc.effectif(eq24.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ nom: "MARCON", buts: 1, cartonsJaunes: 1, passesDecisives: 0, numeroFavori: 9, postes: "9 (1)" });
    });

    it("effectif et championnat comptent pareil (passes, cartons, prenoms)", async () => {
      const { c } = await joueurSurDeuxSaisons();
      const effectif = (await svc.effectif(c.seniors.id)).find((r) => r.nom === "MARCON")!;
      const champ = (await svc.championnat(c.seniors.id)).find((r) => r.nom === "MARCON")!;
      for (const cle of ["matchs", "minutes", "buts", "passesDecisives", "cartonsJaunes", "cartonsRouges"]) {
        expect([cle, champ[cle]]).toEqual([cle, effectif[cle]]);
      }
      expect(champ.equipeId).toBe(c.seniors.id);
    });

    it("saisie manuelle : propre a l'equipe, prime sur les feuilles, ne deborde pas sur l'autre saison", async () => {
      const { c, j, eq24 } = await joueurSurDeuxSaisons();

      await svc.definirStatEquipe(j.id, c.seniors.id, { buts: 7, passesDecisives: 3 });

      const e25 = (await svc.effectif(c.seniors.id)).find((r) => r.nom === "MARCON")!;
      const e24 = (await svc.effectif(eq24.id))[0];
      expect(e25).toMatchObject({ buts: 7, passesDecisives: 3 });
      expect(e24).toMatchObject({ buts: 1, passesDecisives: 0 });
      const h = await svc.historique(j.id);
      expect(h.find((s) => s.saisonNom === "2025-2026")!.lignes[0]).toMatchObject({ buts: 7, passesDecisives: 3 });
      expect(h.find((s) => s.saisonNom === "2024-2025")!.lignes[0]).toMatchObject({ buts: 1 });
      expect((await svc.championnat(c.seniors.id)).find((r) => r.nom === "MARCON")).toMatchObject({ buts: 7, passesDecisives: 3 });
    });

    it("saisie : null efface, undefined laisse en l'etat, une ligne vide est supprimee", async () => {
      const { c, j } = await joueurSurDeuxSaisons();
      const total = () => svc.effectif(c.seniors.id).then((r) => r.find((x) => x.nom === "MARCON")!);

      await svc.definirStatEquipe(j.id, c.seniors.id, { buts: 5, passesDecisives: 2 });
      await svc.definirStatEquipe(j.id, c.seniors.id, { buts: null });
      expect(await total()).toMatchObject({ buts: 2, passesDecisives: 2 });   // buts = calcul feuilles, passes saisies gardees

      await svc.definirStatEquipe(j.id, c.seniors.id, { passesDecisives: null });
      expect(await total()).toMatchObject({ buts: 2, passesDecisives: 1 });
      expect(await ds.getRepository(StatJoueurEquipe).count()).toBe(0);
    });

    it("saisie : 404 pour un joueur ou une equipe inconnus", async () => {
      const { c, j } = await joueurSurDeuxSaisons();
      await expect(svc.definirStatEquipe("inconnu", c.seniors.id, { buts: 1 })).rejects.toThrow(/introuvable/);
      await expect(svc.definirStatEquipe(j.id, "inconnue", { buts: 1 })).rejects.toThrow(/introuvable/);
    });

    it("joueur attache sans match : la saisie de son equipe s'affiche", async () => {
      const c = await contexte();
      const j = await f.joueur({ nom: "RECRUE", prenom: "Kim", clubId: c.moi.id, equipesAttachees: [c.seniors.id] });
      await svc.definirStatEquipe(j.id, c.seniors.id, { buts: 2 });
      expect((await svc.effectif(c.seniors.id))[0]).toMatchObject({ id: j.id, matchs: 0, buts: 2 });
    });
  });

  describe("joueur arrive d'un autre club", () => {
    /** Matteo a joue a Mions en 25-26 puis au club actuel ; sa fiche porte encore Mions. */
    async function arrive() {
      const c = await contexte();
      const mions = await f.club("Mions");
      const s26 = await f.saison("2026-2027", 2026);
      const equipeMions = await f.equipe({ clubId: mions.id, nom: "Seniors", categorie: "Seniors", saisonId: c.saison.id });
      const seniors26 = await f.equipe({ clubId: c.moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s26.id });
      const fiche = await f.joueur({ nom: "GUEDES", prenom: "Matteo", licence: "2544602641", clubId: mions.id, poste: "DC" });
      const m25 = await f.match({ clubDom: mions.id, clubExt: c.adv.id, equipeDomId: equipeMions.id, equipeExtId: c.advEq.id, saisonId: c.saison.id, date: "07/12/2025" });
      await f.compo({ matchId: m25.id, cote: "dom", nom: "GUEDES", prenom: "Matteo", licence: "2544602641" });
      const m26 = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: seniors26.id, equipeExtId: c.advEq.id, saisonId: s26.id, date: "06/09/2026" });
      await f.compo({ matchId: m26.id, cote: "dom", nom: "GUEDES", prenom: "Matteo", licence: "2544602641" });
      return { c, fiche, seniors26, equipeMions };
    }

    it("effectif : retrouve sa fiche par la licence, donc jamais d'id nul (cases de presence liees)", async () => {
      const { fiche, seniors26 } = await arrive();
      const islem = await f.joueur({ nom: "ZERGA", prenom: "Islem", licence: "9604978669", clubId: (await f.club("Venissieux")).id });
      const m = (await ds.getRepository(Match).find({ where: { equipeDomId: seniors26.id } }))[0];
      await f.compo({ matchId: m.id, cote: "dom", nom: "ZERGA", prenom: "Islem", licence: "9604978669" });

      const rows = await svc.effectif(seniors26.id);

      expect(rows.map((r) => r.id).sort()).toEqual([fiche.id, islem.id].sort());
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    });

    it("effectif : le joueur attache a la main ET present sur une feuille n'apparait qu'une fois", async () => {
      const { fiche, seniors26 } = await arrive();
      await svc.attachEquipe(fiche.id, seniors26.id);

      const rows = await svc.effectif(seniors26.id);

      expect(rows.filter((r) => r.nom === "GUEDES")).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: fiche.id, matchs: 1 });
    });

    it("championnat de sa saison passee : retrouve sa fiche meme rattachee a un autre club aujourd'hui", async () => {
      const { c, fiche, equipeMions } = await arrive();
      // Etat apres la derivation : la fiche suit le joueur dans son club actuel.
      await ds.getRepository(Joueur).update(fiche.id, { clubId: c.moi.id });

      const lignes = await svc.championnat(equipeMions.id);

      expect(lignes.find((l) => l.nom === "GUEDES")).toMatchObject({ id: fiche.id, poste: "DC" });
    });
  });

  describe("championnat : rapprochement avec la fiche en base", () => {
    it("sans licence : club + nom + initiale du prenom, donc deux homonymes de nom ne se confondent pas", async () => {
      const c = await contexte();
      const luc = await f.joueur({ nom: "MARTIN", prenom: "Luc", clubId: c.moi.id, poste: "DC" });
      const paul = await f.joueur({ nom: "MARTIN", prenom: "Paul", clubId: c.moi.id, poste: "AT" });
      // Un homonyme exact dans un AUTRE club ne doit pas etre retenu.
      await f.joueur({ nom: "MARTIN", prenom: "Paul", clubId: c.adv.id, poste: "GB" });
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id, date: "10/01/2026" });
      await f.compo({ matchId: m.id, cote: "dom", nom: "MARTIN", prenom: "Paul", licence: undefined, numero: 9 });
      await f.compo({ matchId: m.id, cote: "dom", nom: "MARTIN", prenom: "Luc", licence: undefined, numero: 5 });

      const lignes = await svc.championnat(c.seniors.id);

      expect(lignes.find((l) => l.prenom === "Paul" && l.clubId === c.moi.id)).toMatchObject({ id: paul.id, poste: "AT" });
      expect(lignes.find((l) => l.prenom === "Luc")).toMatchObject({ id: luc.id, poste: "DC" });
    });

    it("joueur absent de la base : ligne conservee, sans identifiant", async () => {
      const c = await contexte();
      const m = await f.match({ clubDom: c.moi.id, clubExt: c.adv.id, equipeDomId: c.seniors.id, equipeExtId: c.advEq.id, saisonId: c.saison.id, date: "10/01/2026" });
      await f.compo({ matchId: m.id, cote: "dom", nom: "INCONNU", prenom: "Zed", licence: undefined });

      const lignes = await svc.championnat(c.seniors.id);

      expect(lignes.find((l) => l.nom === "INCONNU")).toMatchObject({ id: null, poste: null });
    });
  });

  describe("search (floue)", () => {
    beforeEach(async () => {
      await f.joueur({ nom: "DIAGOLA", prenom: "Seydou", licence: "9604756569" });
      await f.joueur({ nom: "MARCON", prenom: "Léo", licence: "9604000001" });
      await f.joueur({ nom: "OLAGNIER", prenom: "Paul", licence: "9604000002" });
      await f.joueur({ nom: "DUPONT", prenom: "Jean" });
    });
    const noms = (r: { nom: string }[]) => r.map((j) => j.nom);

    it("moins de 2 caracteres : aucun resultat", async () => {
      expect(await svc.search("d")).toEqual([]);
      expect(await svc.search("  ")).toEqual([]);
    });

    it("tolere une faute de frappe, les accents et l'ordre nom/prenom", async () => {
      expect(noms(await svc.search("diagolla"))).toEqual(["DIAGOLA"]);
      expect(noms(await svc.search("leo marcon"))).toEqual(["MARCON"]);
      expect(noms(await svc.search("Seydou Diagola"))).toEqual(["DIAGOLA"]);
      expect(noms(await svc.search("dupond"))).toEqual(["DUPONT"]);
    });

    it("classe le prefixe avant la sous-chaine", async () => {
      expect(noms(await svc.search("ola"))).toEqual(["OLAGNIER", "DIAGOLA"]);
    });

    it("recherche par debut de licence", async () => {
      expect(noms(await svc.search("96040000"))).toEqual(["MARCON", "OLAGNIER"]);
    });

    it("respecte la limite", async () => {
      expect(await svc.search("ola", 1)).toHaveLength(1);
    });

    it("ne renvoie rien pour un nom inconnu", async () => {
      expect(await svc.search("zidane")).toEqual([]);
    });

    describe("club le plus recent et derniere saison connue", () => {
      async function parcours() {
        const s24 = await f.saison("2024-2025", 2024);
        const s25 = await f.saison("2025-2026", 2025, { actif: true });
        const mions = await f.club("Mions");
        const ol = await f.club("OL Sud");
        const adv = await f.club("Adverse");
        const jouer = async (club: { id: string }, saison: { id: string }, date: string, compo: { nom: string; prenom?: string; licence?: string }) => {
          const m = await f.match({ clubDom: club.id, clubExt: adv.id, saisonId: saison.id, date });
          await f.compo({ matchId: m.id, cote: "dom", ...compo });
        };
        return { s24, s25, mions, ol, adv, jouer };
      }

      it("un joueur arrive d'un autre club : son club est le plus recent, meme si sa fiche porte l'ancien", async () => {
        const c = await parcours();
        const guedes = { nom: "GUEDES", prenom: "Matteo", licence: "2544602641" };
        await f.joueur({ ...guedes, clubId: c.mions.id });
        await c.jouer(c.mions, c.s24, "07/12/2024", guedes);
        await c.jouer(c.ol, c.s25, "06/09/2025", guedes);

        const [r] = await svc.search("guedes");

        expect(r.clubId).toBe(c.ol.id);
        expect(r.derniereSaison).toEqual({ id: c.s25.id, nom: "2025-2026", court: "25-26", enCours: true });
      });

      it("derniere saison connue passee : indiquee comme telle (24-25), pas en cours", async () => {
        const c = await parcours();
        const parti = { nom: "PARTI", prenom: "Luc", licence: "777" };
        await f.joueur({ ...parti, clubId: c.mions.id });
        await c.jouer(c.mions, c.s24, "07/12/2024", parti);

        const [r] = await svc.search("parti");

        expect(r.clubId).toBe(c.mions.id);
        expect(r.derniereSaison).toMatchObject({ nom: "2024-2025", court: "24-25", enCours: false });
      });

      it("un rattachement a une equipe compte comme saison connue et comme club", async () => {
        const c = await parcours();
        const equipe = await f.equipe({ clubId: c.ol.id, nom: "Seniors", categorie: "Seniors", saisonId: c.s25.id });
        const nouveau = await f.joueur({ nom: "NOUVEAU", prenom: "Zed", clubId: c.mions.id, equipesAttachees: [equipe.id] });

        const [r] = await svc.search("nouveau");

        expect(r.id).toBe(nouveau.id);
        expect(r.clubId).toBe(c.ol.id);
        expect(r.derniereSaison).toMatchObject({ court: "25-26", enCours: true });
      });

      it("joueur jamais vu sur une feuille ni rattache : son club de fiche, pas de saison", async () => {
        const c = await parcours();
        await f.joueur({ nom: "FANTOME", prenom: "Ann", clubId: c.ol.id });

        const [r] = await svc.search("fantome");

        expect(r).toMatchObject({ clubId: c.ol.id, derniereSaison: null });
      });

      it("sans licence : rapproche ses feuilles par nom et club de la fiche, sans confondre un homonyme d'un autre club", async () => {
        const c = await parcours();
        await f.joueur({ nom: "MARTIN", prenom: "Luc", clubId: c.ol.id });
        await c.jouer(c.ol, c.s25, "06/09/2025", { nom: "MARTIN", prenom: "Luc" });
        await c.jouer(c.mions, c.s24, "07/12/2024", { nom: "MARTIN", prenom: "Luc" });   // homonyme d'un autre club

        const [r] = await svc.search("martin");

        expect(r.derniereSaison).toMatchObject({ court: "25-26" });
        expect(r.clubId).toBe(c.ol.id);
      });

      it("sans saison active : la plus recente de la base tient lieu de saison en cours", async () => {
        const s24 = await f.saison("2024-2025", 2024);
        const s25 = await f.saison("2025-2026", 2025);
        const club = await f.club("OL");
        const adv = await f.club("Adverse");
        const m = await f.match({ clubDom: club.id, clubExt: adv.id, saisonId: s24.id, date: "07/12/2024" });
        await f.compo({ matchId: m.id, cote: "dom", nom: "ANCIEN", prenom: "Bob", licence: "5" });
        await f.joueur({ nom: "ANCIEN", prenom: "Bob", licence: "5", clubId: club.id });

        const [r] = await svc.search("ancien");

        expect(s25.id).toBeTruthy();
        expect(r.derniereSaison).toMatchObject({ court: "24-25", enCours: false });
      });
    });
  });
});
