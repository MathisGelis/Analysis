import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { strFromU8 } from "fflate";
import { DataSource } from "typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { Club } from "@/features/clubs/club.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { AnalyseService } from "@/features/analyse/analyse.service";
import { PrematchService, RapportPrematch } from "@/features/analyse/prematch.service";
import { ouvrirPaquet, lire } from "@/features/analyse/pptx-xml";
import { genererRapportPptx, lireModele } from "@/features/analyse/rapport-pptx";
import { construirePageAnalyse } from "@/features/analyse/rapport-pptx-pages";
import { ajusterPuces, contenuRapport, couper, DESCRIPTION_PAGES, estPageModele, lirePages, PAGES_RAPPORT } from "@/features/analyse/rapport-pptx-contenu";

describe("lirePages", () => {
  it("absent : toutes les pages, dans l'ordre du modele", () => {
    expect(lirePages(undefined)).toEqual([...PAGES_RAPPORT]);
    expect(PAGES_RAPPORT).toHaveLength(15);
    expect(PAGES_RAPPORT.filter((p) => estPageModele(p))).toEqual(["couverture", "match", "saison", "forces", "dispositif", "ambiance", "cles"]);
    for (const p of PAGES_RAPPORT) expect(DESCRIPTION_PAGES[p].titre).toBeTruthy();
  });

  it("une liste : seulement ces pages, ordonnees comme le modele, sans doublon", () => {
    expect(lirePages("cles, saison,saison ,couverture")).toEqual(["couverture", "saison", "cles"]);
    expect(lirePages(["match", "forces"])).toEqual(["match", "forces"]);
  });

  it("page inconnue ou liste vide : une erreur claire", () => {
    expect(lirePages("couverture,nimporte")).toEqual({ erreur: expect.stringMatching(/Page inconnue : nimporte/) });
    expect(lirePages(" , ")).toEqual({ erreur: "Choisissez au moins une page." });
    expect(lirePages("")).toEqual({ erreur: "Choisissez au moins une page." });
  });
});

describe("couper", () => {
  it("coupe sur une fin de mot, jamais en plein mot", () => {
    expect(couper("court", 20)).toBe("court");
    expect(couper("Defense permeable : chercher les situations de but dans leur axe", 40)).toBe("Defense permeable : chercher les...");
    expect(couper("Supercalifragilisticexpialidocious", 12)).toBe("Supercali...");
    expect(couper("  espaces   en   trop  ", 40)).toBe("espaces en trop");
  });
});

describe("rapport d'avant-match PowerPoint", () => {
  let ds: DataSource;
  let svc: PrematchService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    const analyse = new AnalyseService(
      ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Joueur),
      ds.getRepository(Composition), ds.getRepository(EvenementMatch), ds.getRepository(Entrainement),
      ds.getRepository(Coach), ds.getRepository(StaffMatch), ds.getRepository(Equipe),
      ds.getRepository(LigneClassement), ds.getRepository(Saison),
    );
    svc = new PrematchService(
      analyse, ds.getRepository(Match), ds.getRepository(Equipe), ds.getRepository(Club),
      ds.getRepository(LigneClassement), ds.getRepository(Saison), ds.getRepository(Arbitre),
    );
    f = fabriques(ds);
  });
  afterEach(() => ds.destroy());

  /** Ma poule, six matchs de l'adversaire (onze lu dans les numeros, buts, cartons, dispositifs) et mon match programme. */
  async function saisonComplete() {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse FC");
    const tiers = await f.club("Tiers AS");
    const s = await f.saison("2025-2026", 2025, { actif: true });
    const commun = { categorie: "Seniors", saisonId: s.id, competitionLibelle: "Seniors D2", poule: "C" };
    const eMoi = await f.equipe({ clubId: moi.id, nom: "Seniors 2", ...commun });
    const eAdv = await f.equipe({ clubId: adv.id, nom: "Seniors", ...commun });
    const eTiers = await f.equipe({ clubId: tiers.id, nom: "Seniors", ...commun });
    await ds.getRepository(LigneClassement).save([
      { clubId: adv.id, equipeId: eAdv.id, saisonId: s.id, rang: 5, joues: 6, v: 3, n: 1, d: 2, bp: 11, bc: 8, pts: 10 },
      { clubId: moi.id, equipeId: eMoi.id, saisonId: s.id, rang: 7, joues: 6, v: 2, n: 2, d: 2, bp: 7, bc: 8, pts: 8 },
    ] as any);
    const equipe: [number, string, string][] = [
      [1, "ROUX", "Marc"], [2, "LEBLANC", "Tom"], [3, "PETIT", "Leo"], [4, "BONNET", "Hugo"], [5, "BOURGEOIS BIDDI", "Jason"], [6, "FABRE", "Eddy"],
      [7, "GIRARD", "Kais"], [8, "ROBIN", "Nassim"], [9, "VENET", "Baptiste"], [10, "MOREAU", "Mael"], [11, "LAMBERT", "Nidal"],
    ];
    // Six matchs : un sur deux a domicile ; le dispositif est saisi sur trois d'entre eux.
    const resultats: [string, number, number, string | null][] = [
      ["07/09/2025", 3, 0, "4-4-2"], ["14/09/2025", 1, 1, null], ["21/09/2025", 0, 2, "4-4-2"],
      ["28/09/2025", 2, 1, null], ["05/10/2025", 1, 2, "4-4-2"], ["12/10/2025", 2, 1, null],
    ];
    for (const [i, [date, bp, bc, formation]] of resultats.entries()) {
      const dom = i % 2 === 0;
      const m = await f.match({
        clubDom: dom ? adv.id : tiers.id, clubExt: dom ? tiers.id : adv.id, equipeDomId: dom ? eAdv.id : eTiers.id, equipeExtId: dom ? eTiers.id : eAdv.id,
        saisonId: s.id, date, journee: String(i + 1), scoreDom: dom ? bp : bc, scoreExt: dom ? bc : bp, statut: "joue",
        ...(formation ? (dom ? { formationDom: formation } : { formationExt: formation }) : {}),
      });
      const cote = dom ? "dom" : "ext";
      for (const [numero, nom, prenom] of equipe) {
        // Mael MOREAU et Baptiste VENET echangent leur numero (9 / 10) un match sur deux : deux attaquants ; Tom LEBLANC
        // et Hugo BONNET (2 / 4) aussi : un lateral qui passe dans l'axe, donc une defense a 4. Seul le 4-4-2 les reunit.
        const echange9 = i % 2 === 1 && (numero === 9 || numero === 10);
        const echange2 = i % 2 === 1 && (numero === 2 || numero === 4);
        await f.compo({ matchId: m.id, cote, nom, prenom, numero: echange9 ? 19 - numero : echange2 ? 6 - numero : numero });
      }
      await f.compo({ matchId: m.id, cote, nom: "BANC", prenom: "Un", numero: 12, titulaire: false, minutes: 0 });
      for (const [minute, joueur] of [[20, "VENET Baptiste"], [60, "VENET Baptiste"], [75, "MOREAU Mael"]] as const) {
        if (i % 2 === 0 || minute !== 60) await f.evenement({ matchId: m.id, type: "but", sousType: "normal", joueur, equipe: cote, minute });
      }
      await f.evenement({ matchId: m.id, type: "carton", sousType: "jaune", motif: "Antisportif", joueur: "FABRE Eddy", equipe: cote, minute: 70 });
    }
    // Face-a-face de la saison passee (ses propres equipes), puis mon match programme (arbitre connu).
    const s24 = await f.saison("2024-2025", 2024);
    const vieux = { categorie: "Seniors", saisonId: s24.id };
    const eMoi24 = await f.equipe({ clubId: moi.id, nom: "Seniors 2", ...vieux });
    const eAdv24 = await f.equipe({ clubId: adv.id, nom: "Seniors", ...vieux });
    await f.match({ clubDom: moi.id, clubExt: adv.id, equipeDomId: eMoi24.id, equipeExtId: eAdv24.id, saisonId: s24.id, date: "10/09/2024", scoreDom: 3, scoreExt: 0, statut: "joue" });
    await f.match({ clubDom: adv.id, clubExt: moi.id, equipeDomId: eAdv24.id, equipeExtId: eMoi24.id, saisonId: s24.id, date: "15/03/2025", scoreDom: 2, scoreExt: 1, statut: "joue" });
    await ds.getRepository(Arbitre).save({ id: "arb1", nom: "MARTIN", prenom: "Paul", matchsPrincipal: 12, cartonsJaunesDonnes: 50, cartonsRougesDonnes: 2, profil: "Strict" } as any);
    await f.match({
      clubDom: moi.id, clubExt: adv.id, equipeDomId: eMoi.id, equipeExtId: eAdv.id, saisonId: s.id, date: "2099-03-14", heure: "20:00",
      terrain: "Stade Municipal", journee: "7", arbitre: "MARTIN Paul", scoreDom: 0, scoreExt: 0, statut: "prevu",
    });
    return { moi, adv, eMoi };
  }

  /** Ecrit le PPTX dans PPTX_SORTIE pour le controle visuel (LibreOffice) ; sans effet sinon. */
  function exporter(nom: string, fichier: Uint8Array) {
    if (!process.env.PPTX_SORTIE) return;
    mkdirSync(process.env.PPTX_SORTIE, { recursive: true });
    writeFileSync(join(process.env.PPTX_SORTIE, nom), fichier);
  }

  const textes = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);

  it("contenu : tout ce que le rapport sait est ecrit, rien d'autre", async () => {
    const c = await saisonComplete();
    const r = await svc.rapport(c.eMoi.id, c.adv.id);
    const x = contenuRapport(r);

    expect(x.libelleEquipe).toBe("OL SUD SENIORS 2");
    expect(x.couverture).toEqual({
      entete: "J7  ·  SENIORS D2  ·  POULE C", club: "ADVERSE FC", affiche: "OL Sud  vs  Adverse FC   —   Domicile",
      date: "Sam. 14/03 · 20h", lieu: "Stade Municipal", classement: "5e · 10 pts",
    });
    expect(x.match).toEqual({
      jour: "Samedi 14/03 — 20h00", convocation: "", adresse: "Stade Municipal", enjeu: "Nous : 7e (8 pts)  ·  Eux : 5e (10 pts)",
      surface: "", dimensions: "", etat: "", aSavoir: "",
    });
    expect(x.saison).toMatchObject({
      classement: "5e", points: "10", vnd: "3-1-2", bp: "11", bc: "8",
      domicile: ["1-0-2", "4", "4"], exterieur: ["2-1-0", "5", "3"],
      jaunes: "6 jaunes", rouges: "0 rouge", buteur: "Baptiste VENET — 9 buts",
    });
    expect(x.saison.derniers.map((d) => [d.issue, d.libelle, d.score])).toEqual([
      ["V", "J6  Tiers AS", "2 - 1 · Ext"], ["D", "J5  Tiers AS", "1 - 2 · Dom"], ["V", "J4  Tiers AS", "2 - 1 · Ext"],
    ]);
    expect(x.dispositif.systeme).toBe("4-4-2");
    expect(x.dispositif.titre).toBe("Dispositif attendu : 4-4-2");
    expect(x.dispositif.source).toBe("Dispositifs saisis + numéros (80 %)");
    // Le dernier match (le plus lourd) a VENET en 10 et MOREAU en 9 : c'est ce que le onze probable reprend.
    expect(x.dispositif.noms).toMatchObject({ 1: "ROUX", 5: "BOURGEOIS BIDDI", 9: "MOREAU", 10: "VENET" });
    expect(x.dispositif.surveiller[0]).toMatchObject({ titre: "VENET — Milieu", numero: "10" });
    expect(x.dispositif.surveiller[0].detail).toMatch(/9 buts/);
    expect(x.ambiance.confrontations).toEqual(["Bilan : 1 V, 0 N, 1 D en 2 matchs", "15/03/2025 : 1-2 chez eux", "10/09/2024 : 3-0 chez nous"]);
    expect(x.ambiance.arbitrage).toBe("Paul MARTIN (strict) : 4,33 cartons par match sur 12 matchs");
    expect(x.ambiance.infos).toMatch(/^Les plus avertis : FABRE \(6 J\)/);
    expect(x.ambiance.publicAmbiance).toBe("");
    // Les champs de coach restent vides.
    expect(x.cles.message).toBe("");
  });

  it("contenu a froid : aucune information inventee, tous les champs inconnus restent vides", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse FC");
    const s = await f.saison("2025-2026", 2025, { actif: true });
    const eMoi = await f.equipe({ clubId: moi.id, nom: "Seniors 2", categorie: "Seniors", saisonId: s.id });
    const x = contenuRapport(await svc.rapport(eMoi.id, adv.id));

    expect(x.couverture).toEqual({ entete: "", club: "ADVERSE FC", affiche: "OL Sud  vs  Adverse FC", date: "", lieu: "", classement: "" });
    expect(x.match).toEqual({ jour: "", convocation: "", adresse: "", enjeu: "", surface: "", dimensions: "", etat: "", aSavoir: "" });
    expect(x.saison).toEqual({
      classement: "", points: "", vnd: "", bp: "", bc: "", derniers: [], domicile: ["", "", ""], exterieur: ["", "", ""], jaunes: "", rouges: "", buteur: "",
    });
    expect(x.forces).toEqual({ forces: [], faiblesses: [], exploiter: "", taille: 1300, espaceAvant: 1000 });
    expect(x.dispositif).toEqual({ systeme: null, titre: "Dispositif attendu : ", source: "", noms: {}, surveiller: [] });
    expect(x.ambiance).toEqual({ publicAmbiance: "", confrontations: [""], arbitrage: "", infos: "" });
    expect(x.cles).toEqual({ cles: ["", "", ""], message: "", taille: expect.any(Number) });
  });

  it("contenu d'analyse : comparatif, forme, systeme, onze, polyvalence, joueurs, face-a-face, rien d'invente", async () => {
    const c = await saisonComplete();
    const x = contenuRapport(await svc.rapport(c.eMoi.id, c.adv.id));

    expect(x.comparatif.nous).toBe("OL Sud");
    expect(x.comparatif.eux).toBe("Adverse FC");
    expect(x.comparatif.lignes[0]).toEqual({ libelle: "Classement", nous: "7e", eux: "5e", meilleur: "eux" });
    expect(x.comparatif.lignes.find((l) => l.libelle === "Points")).toMatchObject({ nous: "8", eux: "10", meilleur: "eux" });
    expect(x.comparatif.lignes.find((l) => l.libelle === "Buts marqués / match")).toMatchObject({ nous: "—", eux: "1,50", meilleur: null });
    expect(x.comparatif.projection).toBeNull();
    expect(x.comparatif.noteProjection).toMatch(/0 pour nous, 6 pour eux/);

    expect(x.forme.eux.pastilles).toEqual(["N", "D", "V", "D", "V"]);
    expect(x.forme.eux.serie).toMatch(/^3 /);
    expect(x.forme.nous.pastilles).toEqual([]);
    expect(x.forme.derniersEux[0]).toEqual({ issue: "V", libelle: "J6  Tiers AS", score: "2 - 1 · Ext" });
    expect(x.forme.constats.length).toBeGreaterThan(0);
    expect(x.forme.constats.length).toBeLessThanOrEqual(6);

    expect(x.pistes.length).toBeGreaterThan(0);
    expect(x.pistes.every((p) => p.titre && p.detail)).toBe(true);

    expect(x.systeme).toMatchObject({ systeme: "4-4-2", confiance: 80, fiabilite: "fiabilité moyenne", structure: "défense à 4 · 2 attaquants", exploitable: true, feuilles: 6 });
    expect(x.systeme.source).toBe("Dispositifs renseignés + numéros de maillot");
    expect(x.systeme.indices.length).toBeGreaterThan(0);
    expect(x.systeme.alternatives.every((a) => a.systeme !== "4-4-2")).toBe(true);

    expect(x.onze.lignes).toHaveLength(11);
    expect(x.onze.lignes[0]).toMatchObject({ numero: 1, code: "GB", libelle: "Gardien", joueur: "Marc ROUX", origine: "numero", titularisations: "6 au n°1" });
    expect(x.onze.lignes[1]).toMatchObject({ numero: 2, code: "DD", joueur: "Hugo BONNET", autres: "Tom LEBLANC (3)" });
    expect(x.polyvalence.joueurs.map((j) => j.nom).sort()).toEqual(["Baptiste VENET", "Hugo BONNET", "Mael MOREAU", "Tom LEBLANC"]);
    expect(x.polyvalence.joueurs.find((j) => j.nom === "Baptiste VENET")).toMatchObject({ titularisations: 6, numeros: "10 (3) · 9 (3)", postes: "MO / BU" });
    expect(x.polyvalence.autres).toBe(7);

    expect(x.joueurs.kpi).toMatchObject({ danger: expect.stringMatching(/^\d+$/), changements: "0,0" });
    expect(x.joueurs.buteurs[0]).toEqual({ nom: "Baptiste VENET", buts: 9 });
    expect(x.joueurs.avertis[0]).toMatchObject({ jaunes: 6, rouges: 0 });
    expect(x.joueurs.discipline).toBe("6 jaunes · 0 rouge · 1,0 jaune par match · 0 % des cartons après la 75e");

    expect(x.face).toMatchObject({ bilan: "1-0-1", joues: 2, buts: "4 marqués, 2 encaissés", arbitreSaisi: "MARTIN Paul" });
    expect(x.face.rencontres.map((r) => [r.issue, r.score, r.lieu, r.date])).toEqual([["D", "1 - 2", "chez eux", "15/03/2025"], ["V", "3 - 0", "chez nous", "10/09/2024"]]);
    expect(x.face.arbitre).toEqual({ nom: "Paul MARTIN", profil: "strict", matchs: "12 matchs", cartonsParMatch: "4,3", cartons: "50 jaunes · 2 rouges", motifs: [] });
  });

  it("contenu d'analyse a froid : tout est vide ou absent", async () => {
    const moi = await f.club("OL Sud");
    const adv = await f.club("Adverse FC");
    const s = await f.saison("2025-2026", 2025, { actif: true });
    const eMoi = await f.equipe({ clubId: moi.id, nom: "Seniors 2", categorie: "Seniors", saisonId: s.id });
    const x = contenuRapport(await svc.rapport(eMoi.id, adv.id));

    expect(x.comparatif.projection).toBeNull();
    expect(x.comparatif.lignes.find((l) => l.libelle === "Classement")).toMatchObject({ nous: "—", eux: "—", meilleur: null });
    expect(x.forme.nous.pastilles).toEqual([]);
    expect(x.forme.derniersEux).toEqual([]);
    expect(x.forme.constats).toEqual([]);
    expect(x.pistes).toEqual([]);
    expect(x.systeme).toMatchObject({ systeme: null, confiance: 0, fiabilite: "", structure: "", alternatives: [], exploitable: false });
    expect(x.onze.lignes).toEqual([]);
    expect(x.polyvalence).toMatchObject({ joueurs: [], autres: 0, exploitable: false });
    expect(x.joueurs).toMatchObject({ kpi: null, cles: [], buteurs: [], avertis: [], discipline: "" });
    expect(x.face).toEqual({ bilan: "", joues: 0, buts: "", rencontres: [], arbitre: null, arbitreSaisi: "" });
  });

  describe("fichier", () => {
    let rapport: RapportPrematch;
    beforeEach(async () => {
      const c = await saisonComplete();
      rapport = await svc.rapport(c.eMoi.id, c.adv.id);
    });

    it("quinze pages, remplies : texte du rapport, plus aucun [champ] du modele, onze place selon le dispositif", () => {
      const fichier = genererRapportPptx(lireModele(), contenuRapport(rapport), PAGES_RAPPORT);
      exporter("rapport-complet.pptx", fichier);
      const p = ouvrirPaquet(fichier);

      const diapos = [...p.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
      expect(diapos).toHaveLength(15);
      const toutes = diapos.map((k) => strFromU8(p.get(k)!));
      const tous = toutes.flatMap(textes);
      expect(tous.filter((t) => /\[[^\]]*\]/.test(t))).toEqual([]);          // plus aucun champ-exemple du modele
      expect(tous).toEqual(expect.arrayContaining(["ADVERSE FC", "Stade Municipal", "Samedi 14/03 — 20h00", "5e · 10 pts", "Dispositif attendu : 4-4-2", "3-1-2"]));
      expect(tous).toContain("OL SUD SENIORS 2  ·  PRÉSENTATION ADVERSAIRE");
      // Les noms des joueurs probables, ajoutes sous les ronds de la page 5.
      const page5 = textes(lire(p, "ppt/slides/slide5.xml"));
      expect(page5).toEqual(expect.arrayContaining(["ROUX", "BOURGEOIS B.", "VENET", "MOREAU"]));
      expect(strFromU8(p.get("ppt/slides/slide5.xml")!)).not.toMatch(/undefined|NaN|\[object/);
    });

    /** Les fichiers de diapositives dans l'ordre de la presentation. */
    const ordre = (p: ReturnType<typeof ouvrirPaquet>) => {
      const rels = lire(p, "ppt/_rels/presentation.xml.rels");
      const cible = new Map([...rels.matchAll(/<Relationship [^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])![1], /Target="slides\/(slide\d+\.xml)"/.exec(m[0])?.[1]]));
      return [...lire(p, "ppt/presentation.xml").matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map((m) => cible.get(m[1]));
    };

    it("pages d'analyse : intercalees dans l'ordre du dossier, au style du modele, numerotees, sans champ vide inventé", () => {
      const fichier = genererRapportPptx(lireModele(), contenuRapport(rapport), PAGES_RAPPORT);
      const p = ouvrirPaquet(fichier);
      const fichiers = ordre(p) as string[];
      expect(fichiers).toHaveLength(15);

      // Les pages du modele gardent leur fichier ; les huit nouvelles s'inserent a leur place.
      expect(fichiers.slice(0, 3)).toEqual(["slide1.xml", "slide2.xml", "slide3.xml"]);
      expect(fichiers[5]).toBe("slide4.xml");      // forces & faiblesses, apres comparatif et forme
      expect(fichiers[7]).toBe("slide5.xml");      // dispositif, apres les pistes
      expect(fichiers.slice(-2)).toEqual(["slide6.xml", "slide7.xml"]);
      expect(fichiers.filter((f) => !/^slide[1-7]\.xml$/.test(f))).toHaveLength(8);

      const xml = (f: string) => lire(p, `ppt/slides/${f}`);
      const t = (f: string) => textes(xml(f));
      expect(t(fichiers[3])).toEqual(expect.arrayContaining(["Nous contre eux", "OL Sud", "Adverse FC", "7e", "5e", "En vert : la meilleure valeur de chaque ligne."]));
      expect(t(fichiers[4])).toEqual(expect.arrayContaining(["Forme &amp; dynamique", "LEURS 5 DERNIERS MATCHS", "J6  Tiers AS", "2 - 1 · Ext", "CE QUE DISENT LES MATCHS"]));
      expect(t(fichiers[6])).toEqual(expect.arrayContaining(["Pistes pour le match"]));
      expect(t(fichiers[8])).toEqual(expect.arrayContaining(["Pourquoi ce système ?", "4-4-2", "Confiance 80 %  ·  fiabilité moyenne", "défense à 4 · 2 attaquants"]));
      expect(t(fichiers[9])).toEqual(expect.arrayContaining(["Onze probable par poste", "Marc ROUX", "6 au n°1", "Tom LEBLANC (3)"]));
      expect(t(fichiers[10])).toEqual(expect.arrayContaining(["Changements de numéro", "Baptiste VENET", "10 (3) · 9 (3)", "MO / BU"]));
      expect(t(fichiers[11])).toEqual(expect.arrayContaining(["Joueurs clés &amp; discipline", "Baptiste VENET", "9"]));
      expect(t(fichiers[12])).toEqual(expect.arrayContaining(["Face-à-face &amp; arbitre", "1-0-1", "Paul MARTIN", "12 matchs", "50 jaunes · 2 rouges"]));

      // Numerotation : la page N du dossier porte N, avec le meme pied de page partout.
      fichiers.forEach((f, i) => {
        // La couverture (premiere) et la page de cloture (derniere, sombre) n'ont pas de pied de page.
        if (i > 0 && i < 14) {
          expect(t(f)).toContain(String(i + 1));
          expect(t(f)).toContain("OL SUD SENIORS 2  ·  PRÉSENTATION ADVERSAIRE");
        }
        expect(xml(f)).not.toMatch(/undefined|NaN|\[object/);
      });
    });

    it("pages d'analyse seules : aucun reste du modele, juste les icones citees, ordre demande respecte", () => {
      const fichier = genererRapportPptx(lireModele(), contenuRapport(rapport), ["onze", "comparatif"]);
      exporter("rapport-2-pages-analyse.pptx", fichier);
      const p = ouvrirPaquet(fichier);
      const fichiers = ordre(p) as string[];
      expect(fichiers).toHaveLength(2);
      // Ordre du dossier, pas de la demande : le comparatif precede le onze.
      expect(textes(lire(p, `ppt/slides/${fichiers[0]}`))).toContain("Nous contre eux");
      expect(textes(lire(p, `ppt/slides/${fichiers[1]}`))).toContain("Onze probable par poste");
      expect([...p.keys()].some((k) => k.startsWith("ppt/slides/") && strFromU8(p.get(k) ?? new Uint8Array()).includes("Convocation"))).toBe(false);
      const citees = new Set([...p.keys()].filter((k) => k.endsWith(".rels")).flatMap((k) => [...strFromU8(p.get(k)!).matchAll(/\.\.\/media\/([^"]+)"/g)].map((m) => `ppt/media/${m[1]}`)));
      expect([...p.keys()].filter((k) => k.startsWith("ppt/media/")).sort()).toEqual([...citees].sort());
      expect(citees.size).toBe(2);      // la balance (comparatif) et le terrain (onze)
    });

    it("pages d'analyse a froid : un message clair a la place des tableaux, jamais de page cassee", async () => {
      const moi = await f.club("Autre Club");
      const adv = await f.club("Inconnu FC");
      const s = await f.saison("2023-2024", 2023);
      const e = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s.id });
      const froid = contenuRapport(await svc.rapport(e.id, adv.id));
      const analyses = PAGES_RAPPORT.filter((x) => !estPageModele(x));
      const fichier = genererRapportPptx(lireModele(), froid, analyses);
      exporter("rapport-analyse-a-froid.pptx", fichier);
      const p = ouvrirPaquet(fichier);
      const tout = (ordre(p) as string[]).flatMap((f) => textes(lire(p, `ppt/slides/${f}`)));
      expect(tout).toEqual(expect.arrayContaining([
        expect.stringMatching(/Pas assez de matchs joués pour projeter/),
        expect.stringMatching(/dégager des pistes fiables/),
        expect.stringMatching(/Aucune feuille de match de cette équipe/),
      ]));
      expect(tout.join(" ")).not.toMatch(/undefined|NaN|\[object/);
    });

    it("pages d'analyse chargees au maximum : tout est ecrit, rien n'est coupe", () => {
      const base = contenuRapport(rapport);
      const longue = "Defense permeable : Adverse FC encaisse 2,1 buts par match, dont beaucoup sur coups de pied arretes : travailler les corners";
      const contenu = {
        ...base,
        comparatif: { ...base.comparatif, projection: { victoire: 46, nul: 27, defaite: 27, score: "2 – 1", probaScore: 12, butsNous: "1,8", butsEux: "1,2", matchs: 7, lieu: "à domicile" }, noteProjection: "" },
        forme: {
          ...base.forme,
          nous: { ...base.forme.eux, club: "OL Sud Seniors 2 Longue Equipe" },
          constats: Array.from({ length: 6 }, (_, i) => ({ ton: (["positif", "negatif", "neutre"] as const)[i % 3], titre: `Constat ${i + 1}`, detail: longue })),
        },
        pistes: Array.from({ length: 10 }, (_, i) => ({ ton: (["atout", "vigilance", "info"] as const)[i % 3], importance: 1 + (i % 3), titre: `Piste ${i + 1}`, detail: longue })),
        joueurs: {
          ...base.joueurs,
          cles: Array.from({ length: 5 }, (_, i) => ({ nom: `Léo DE LA FONTAINE ${i}`, poste: "MC", titularisations: "8 / 9", impact: "+0,85 pt/match" })),
          buteurs: Array.from({ length: 5 }, (_, i) => ({ nom: `Buteur ${i + 1}`, buts: 9 - i })),
          avertis: Array.from({ length: 5 }, (_, i) => ({ nom: `AVERTI ${i + 1}`, jaunes: 5 - i, rouges: i % 2 })),
        },
        polyvalence: { ...base.polyvalence, joueurs: Array.from({ length: 10 }, (_, i) => ({ nom: `Joueur Polyvalent ${i + 1}`, titularisations: 9, numeros: "2 (4) · 4 (3) · 5 (2)", postes: "DD / DCD / DCG" })) },
        face: { ...base.face, rencontres: Array.from({ length: 6 }, (_, i) => ({ issue: (["V", "N", "D"] as const)[i % 3], score: `${i} - 1`, lieu: "chez nous", date: `0${i + 1}/09/2024` })), arbitre: { nom: "Paul MARTIN", profil: "strict", matchs: "12 matchs", cartonsParMatch: "4,3", cartons: "50 jaunes · 2 rouges", motifs: ["Antisportif", "Contestation", "Jeu dangereux"] } },
      };
      const fichier = genererRapportPptx(lireModele(), contenu, PAGES_RAPPORT.filter((x) => !estPageModele(x)));
      exporter("rapport-analyse-charge.pptx", fichier);
      const p = ouvrirPaquet(fichier);
      const tout = (ordre(p) as string[]).flatMap((f) => textes(lire(p, `ppt/slides/${f}`)));
      expect(tout.filter((t) => t === longue)).toHaveLength(16);       // 6 constats + 10 pistes, en entier
      expect(tout).toEqual(expect.arrayContaining(["46 %", "2 – 1", "Léo DE LA FONTAINE 4", "Joueur Polyvalent 10", "Buteur 5", "Jeu dangereux"]));
      expect(tout.join(" ")).not.toMatch(/undefined|NaN|\[object|\.\.\./);
    });

    it("construirePageAnalyse : une page, ses images (icone en rId2) et un pied de page a son numero", () => {
      const modele = strFromU8(ouvrirPaquet(lireModele()).get("ppt/slides/slide2.xml")!);
      const { xml, images } = construirePageAnalyse("comparatif", contenuRapport(rapport), 4, modele);
      expect(images).toHaveLength(1);
      expect(images[0]).toMatch(/^image\d+\.png$/);
      expect(xml).toContain('r:embed="rId2"');
      expect(textes(xml)).toEqual(expect.arrayContaining(["COMPARATIF", "Nous contre eux", "4", "OL SUD SENIORS 2  ·  PRÉSENTATION ADVERSAIRE"]));
      const ids = [...xml.matchAll(/<p:cNvPr\b[^>]*?\sid="(\d+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);      // aucun identifiant de forme en double
    });

    it("pages au choix : les autres disparaissent avec leurs notes et leurs images, les pieds de page sont renumerotes", () => {
      const fichier = genererRapportPptx(lireModele(), contenuRapport(rapport), ["couverture", "saison", "dispositif"]);
      exporter("rapport-3-pages.pptx", fichier);
      const p = ouvrirPaquet(fichier);

      const diapos = [...p.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort();
      expect(diapos).toEqual(["ppt/slides/slide1.xml", "ppt/slides/slide3.xml", "ppt/slides/slide5.xml"]);
      expect([...p.keys()].filter((k) => k.startsWith("ppt/notesSlides/") && k.endsWith(".xml"))).toHaveLength(3);
      expect(lire(p, "ppt/presentation.xml").match(/<p:sldId /g)).toHaveLength(3);
      expect(lire(p, "[Content_Types].xml")).not.toMatch(/slide2\.xml|slide4\.xml|slide6\.xml|slide7\.xml/);
      // Page 2 du dossier (la saison), page 3 (le dispositif) : la couverture n'a pas de numero.
      expect(textes(lire(p, "ppt/slides/slide3.xml"))).toContain("2");
      expect(textes(lire(p, "ppt/slides/slide5.xml"))).toContain("3");
      // Plus aucune image que les pages gardees ne citent.
      const citees = new Set([...p.keys()].filter((k) => k.endsWith(".rels")).flatMap((k) => [...strFromU8(p.get(k)!).matchAll(/\.\.\/media\/([^"]+)"/g)].map((m) => `ppt/media/${m[1]}`)));
      expect([...p.keys()].filter((k) => k.startsWith("ppt/media/")).sort()).toEqual([...citees].sort());
    });

    it("sans la page convocation : aucune trace de la page, et les autres pages renumerotees", () => {
      const sans = PAGES_RAPPORT.filter((x) => x !== "match");
      const p = ouvrirPaquet(genererRapportPptx(lireModele(), contenuRapport(rapport), sans));
      expect(p.has("ppt/slides/slide2.xml")).toBe(false);
      expect([...p.keys()].some((k) => k.startsWith("ppt/slides/") && strFromU8(p.get(k) ?? new Uint8Array()).includes("Convocation"))).toBe(false);
      expect(textes(lire(p, "ppt/slides/slide3.xml"))).toContain("2");       // "Leur saison" devient la page 2
    });

    it("une seule page, ou aucune : la premiere marche, la seconde est refusee", () => {
      const p = ouvrirPaquet(genererRapportPptx(lireModele(), contenuRapport(rapport), ["cles"]));
      expect([...p.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))).toEqual(["ppt/slides/slide7.xml"]);
      expect(() => genererRapportPptx(lireModele(), contenuRapport(rapport), [])).toThrow(/Aucune page/);
    });

    it("quatre puces par colonne : police reduite pour tenir dans la carte, texte et 'a exploiter' ecrits", () => {
      const base = contenuRapport(rapport);
      const longue = "Defense permeable : Adverse FC encaisse 2,1 buts par match : chercher les situations de but et les centres";
      // Ce que `contenuRapport` ecrit pour quatre puces longues : la police la plus grande qui tient dans la carte.
      const puces = ajusterPuces([[longue, longue, longue, longue], [longue, "Attaque en panne", "Moins a l'aise a l'exterieur", "Serie difficile"]]);
      expect(puces.taille).toBeLessThan(1300);
      const contenu = {
        ...base,
        forces: { forces: puces.colonnes[0], faiblesses: puces.colonnes[1], exploiter: "Jouer vite dans le dos des lateraux", taille: puces.taille, espaceAvant: puces.espaceAvant },
      };
      const fichier = genererRapportPptx(lireModele(), contenu, ["forces"]);
      exporter("rapport-forces-4-puces.pptx", fichier);
      const xml = lire(ouvrirPaquet(fichier), "ppt/slides/slide4.xml");
      expect(textes(xml)).toEqual(expect.arrayContaining([longue, "Attaque en panne", "Jouer vite dans le dos des lateraux"]));
      expect(xml.match(/<a:p>/g)!.length).toBeGreaterThanOrEqual(8);
      expect(xml).toContain(`sz="${puces.taille}"`);
    });

    it("systeme inconnu mais onze lu dans les numeros : les noms sont ecrits sur la disposition du modele, le titre reste vide", () => {
      const base = contenuRapport(rapport);
      const contenu = { ...base, dispositif: { ...base.dispositif, systeme: null, titre: "Dispositif attendu : ", source: "Systeme inconnu : onze lu dans les numeros de maillot" } };
      const xml = lire(ouvrirPaquet(genererRapportPptx(lireModele(), contenu, ["dispositif"])), "ppt/slides/slide5.xml");
      expect(textes(xml)).toEqual(expect.arrayContaining(["Dispositif attendu : ", "ROUX", "VENET", "Systeme inconnu : onze lu dans les numeros de maillot"]));
      // Les ronds restent la ou le modele les met (le 9 en haut de l'attaque, a x = 4059936).
      expect(xml).toMatch(/<p:cNvPr id="177"[\s\S]*?<a:off x="4059936" y="2185416"\/>/);
    });

    it("pas de match joue : les lignes 'derniers matchs' disparaissent avec leurs traits, les champs de saison restent vides", async () => {
      const moi = await f.club("Autre Club");
      const adv = await f.club("Inconnu FC");
      const s = await f.saison("2023-2024", 2023);
      const e = await f.equipe({ clubId: moi.id, nom: "Seniors", categorie: "Seniors", saisonId: s.id });
      const froid = await svc.rapport(e.id, adv.id);
      const fichier = genererRapportPptx(lireModele(), contenuRapport(froid), ["saison", "dispositif"]);
      exporter("rapport-a-froid.pptx", fichier);
      const xml = lire(ouvrirPaquet(fichier), "ppt/slides/slide3.xml");
      for (const id of [98, 99, 100, 101, 102, 103, 107, 108, 111]) expect(xml).not.toContain(`<p:cNvPr id="${id}" `);
      expect(xml).toContain('<p:cNvPr id="113" ');                              // le tableau, lui, reste (a remplir)
      expect(textes(xml)).not.toContain("[5e]");
    });

    it("l'export du service : nom de fichier lisible, pages demandees seulement", async () => {
      const { fichier, nom } = await svc.exporterPptx(rapport.monEquipe.equipeId, rapport.adversaire.clubId, null, ["couverture", "cles"]);
      expect(nom).toBe("avant-match-Adverse-FC-2099-03-14.pptx");
      expect([...ouvrirPaquet(fichier).keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort()).toEqual(["ppt/slides/slide1.xml", "ppt/slides/slide7.xml"]);
    });
  });
});
