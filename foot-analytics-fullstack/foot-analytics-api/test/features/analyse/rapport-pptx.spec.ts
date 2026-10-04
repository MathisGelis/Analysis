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
import { contenuRapport, couper, DESCRIPTION_PAGES, lirePages, PAGES_RAPPORT } from "@/features/analyse/rapport-pptx-contenu";

describe("lirePages", () => {
  it("absent : toutes les pages, dans l'ordre du modele", () => {
    expect(lirePages(undefined)).toEqual([...PAGES_RAPPORT]);
    expect(PAGES_RAPPORT).toHaveLength(7);
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
        // Mael MOREAU et Baptiste VENET echangent leur numero (9 / 10) un match sur deux : deux attaquants.
        const echange = i % 2 === 1 && (numero === 9 || numero === 10);
        await f.compo({ matchId: m.id, cote, nom, prenom, numero: echange ? 19 - numero : numero });
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
    expect(x.dispositif.source).toMatch(/4-4-2|renseigne|numeros/);
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
    expect(x.forces).toEqual({ forces: [], faiblesses: [], exploiter: "", taille: 1300 });
    expect(x.dispositif).toEqual({ systeme: null, titre: "Dispositif attendu : ", source: "", noms: {}, surveiller: [] });
    expect(x.ambiance).toEqual({ publicAmbiance: "", confrontations: [""], arbitrage: "", infos: "" });
    expect(x.cles).toEqual({ cles: ["", "", ""], message: "" });
  });

  describe("fichier", () => {
    let rapport: RapportPrematch;
    beforeEach(async () => {
      const c = await saisonComplete();
      rapport = await svc.rapport(c.eMoi.id, c.adv.id);
    });

    it("sept pages, remplies : texte du rapport, plus aucun [champ] du modele, onze place selon le dispositif", () => {
      const fichier = genererRapportPptx(lireModele(), contenuRapport(rapport), PAGES_RAPPORT);
      exporter("rapport-complet.pptx", fichier);
      const p = ouvrirPaquet(fichier);

      const diapos = [...p.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
      expect(diapos).toHaveLength(7);
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
      const contenu = {
        ...base,
        forces: { forces: [longue, longue, longue, longue], faiblesses: [longue, "Attaque en panne", "Moins a l'aise a l'exterieur", "Serie difficile"], exploiter: "Jouer vite dans le dos des lateraux", taille: 1100 },
      };
      const fichier = genererRapportPptx(lireModele(), contenu, ["forces"]);
      exporter("rapport-forces-4-puces.pptx", fichier);
      const xml = lire(ouvrirPaquet(fichier), "ppt/slides/slide4.xml");
      expect(textes(xml)).toEqual(expect.arrayContaining([longue, "Attaque en panne", "Jouer vite dans le dos des lateraux"]));
      expect(xml.match(/<a:p>/g)!.length).toBeGreaterThanOrEqual(8);
      expect(xml).toContain('sz="1100"');
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
