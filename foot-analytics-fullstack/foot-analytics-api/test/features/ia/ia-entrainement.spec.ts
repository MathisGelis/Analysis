import { construireJeuDonnees } from "@/features/ia/ia-donnees";
import { DonneesInsuffisantes, entrainer, GRILLE_COMPLETE, Progression, resumeDuResultat } from "@/features/ia/ia-entrainement";
import { HYPER_PAR_DEFAUT, poidsInitiaux } from "@/features/ia/ia-modele";
import { ligue } from "./ligue";

const UN_SEUL = [HYPER_PAR_DEFAUT];

describe("entrainer : la marche avant", () => {
  const jeu = construireJeuDonnees(ligue({ clubs: 8, semaines: 25, absence: 0.15 }));

  it("predit chaque semaine avant de la decouvrir : rien a predire la premiere, des predictions ensuite", async () => {
    const r = await entrainer(jeu, { grille: UN_SEUL });
    expect(r.courbe).toHaveLength(25);
    expect(r.courbe[0].n).toBe(0);                       // premiere semaine : personne n'a d'historique
    expect(r.courbe[0].modele.onze).toBeNull();
    // Huit clubs jouent chaque semaine ; une feuille a moins de 11 titulaires (trop d'absents tires au sort) : ecartee.
    expect(r.courbe.slice(1).every((p) => p.n >= 7 && p.n <= 8)).toBe(true);
    expect(r.global.modele.n).toBe(r.donnees.feuilles - 8);
    expect(r.sansHistorique).toBe(8);
    expect(r.donnees).toMatchObject({ etapes: 25, equipes: 8 });
    expect(r.donnees.feuilles).toBeGreaterThanOrEqual(198);
  });

  it("apprend : bien meilleur que de rejouer le dernier onze, au niveau des 11 plus souvent titulaires", async () => {
    const r = await entrainer(jeu, { grille: UN_SEUL });
    const { modele, dernier, moteur, frequence } = r.recent;
    // Absences au hasard (15 %) : le dernier onze est un mauvais guide, le onze habituel un bon (environ 85 %).
    expect(modele.onze!).toBeGreaterThan(dernier.onze! + 0.04);
    expect(modele.onze!).toBeGreaterThan(0.8);
    expect(modele.onze!).toBeGreaterThanOrEqual(frequence.onze! - 0.03);
    expect(modele.onze!).toBeGreaterThanOrEqual(moteur.onze! - 0.03);
    // Les numeros sont ceux de la convention : les postes sont bien predits aussi.
    expect(modele.postes!).toBeGreaterThan(0.7);
    expect(r.nouveaux).toBe(0);
  });

  it("les poids appris s'eloignent de l'a priori et restent raisonnables ; les probabilites sont calibrees", async () => {
    const r = await entrainer(jeu, { grille: UN_SEUL });
    const depart = poidsInitiaux().titularisation.w;
    const moved = r.poids.titularisation.w.some((w, i) => Math.abs(w - depart[i]) > 0.1);
    expect(moved).toBe(true);
    expect(r.poids.titularisation.w.every((w) => Number.isFinite(w) && Math.abs(w) < 30)).toBe(true);
    expect(r.poids.numeros.w.every((w) => Number.isFinite(w) && Math.abs(w) < 30)).toBe(true);
    expect(r.perte).toBeGreaterThan(0);
    // Il apprend : la perte des dernieres semaines est nettement sous celle des premieres (poids de depart).
    const moyenne = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0) / xs.length;
    expect(moyenne(r.courbe.slice(-8).map((p) => p.perte))).toBeLessThan(moyenne(r.courbe.slice(1, 5).map((p) => p.perte)) - 0.03);
    // Calibration : ecart moyen (pondere par l'effectif des bandes) entre probabilite annoncee et frequence observee.
    const peuplees = r.calibration.filter((x) => x.n > 0);
    const total = peuplees.reduce((t, b) => t + b.n, 0);
    const ecart = peuplees.reduce((t, b) => t + b.n * Math.abs(b.probaMoyenne! - b.tauxObserve!), 0) / total;
    expect(ecart).toBeLessThan(0.08);
  });

  it("AUCUNE FUITE : changer l'avenir ne change rien au passe", async () => {
    const base = await entrainer(jeu, { grille: UN_SEUL });
    // On bouleverse les feuilles des 5 dernieres semaines (titulaires <-> remplacants, au hasard).
    const brouille = construireJeuDonnees(ligue({ clubs: 8, semaines: 25, absence: 0.15 }));
    for (const etape of brouille.etapes.slice(-5)) {
      for (const f of etape.feuilles) f.lignes = f.lignes.map((l, i) => ({ ...l, titulaire: (i * 7 + etape.indice) % 16 < 11 }));
    }
    const apres = await entrainer(brouille, { grille: UN_SEUL });
    const identiques = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    for (let i = 0; i < 20; i++) expect(identiques(apres.courbe[i], base.courbe[i])).toBe(true);
    expect(identiques(apres.courbe[24], base.courbe[24])).toBe(false);     // et le futur, lui, a bien change
  });

  it("une grille d'essais : le meilleur (perte la plus basse) est retenu, tous sont listes", async () => {
    const petit = construireJeuDonnees(ligue({ clubs: 6, semaines: 12 }));
    const r = await entrainer(petit, { grille: GRILLE_COMPLETE });
    expect(r.essais).toHaveLength(GRILLE_COMPLETE.length);
    const pertes = r.essais.map((e) => e.perte!);
    expect(pertes).toEqual([...pertes].sort((a, b) => a - b));
    expect(r.perte).toBe(Math.min(...pertes));
    expect(r.hyper).toEqual(r.essais[0].hyper);
    expect(r.poids.hyper).toEqual(r.hyper);
  });

  it("progression de 0 a 100, sans jamais reculer, et rend la main entre les etapes", async () => {
    const vues: Progression[] = [];
    let rendues = 0;
    await entrainer(construireJeuDonnees(ligue({ clubs: 4, semaines: 6 })), {
      grille: UN_SEUL, progression: (p) => vues.push(p), cooperer: async () => { rendues++; },
    });
    expect(vues[0].pourcentage).toBeLessThanOrEqual(5);
    expect(vues[vues.length - 1]).toEqual({ pourcentage: 100, message: "Entrainement termine" });
    const pct = vues.map((v) => v.pourcentage);
    expect([...pct].sort((a, b) => a - b)).toEqual(pct);
    expect(rendues).toBeGreaterThanOrEqual(6);
  });

  it("annulation : l'entrainement s'arrete avec une erreur claire", async () => {
    let etapes = 0;
    await expect(entrainer(jeu, { grille: UN_SEUL, annule: () => ++etapes > 3 })).rejects.toThrow(/annule/i);
  });

  it("deterministe : deux entrainements identiques donnent exactement le meme resultat", async () => {
    const a = await entrainer(jeu, { grille: UN_SEUL });
    const b = await entrainer(jeu, { grille: UN_SEUL });
    expect(JSON.stringify({ ...a, dureeMs: 0 })).toBe(JSON.stringify({ ...b, dureeMs: 0 }));
  });
});

describe("entrainer : les erreurs sont notees", () => {
  it("les pires compositions sont listees avec les titulaires manques et les faux positifs ; les joueurs difficiles a lire aussi", async () => {
    const jeu = construireJeuDonnees(ligue({ clubs: 8, semaines: 25, absence: 0.3, graine: 5 }));
    const r = await entrainer(jeu, { grille: UN_SEUL });
    expect(r.pires.length).toBeGreaterThan(5);
    expect(r.pires.length).toBeLessThanOrEqual(30);
    expect(r.pires.map((p) => p.onze)).toEqual([...r.pires.map((p) => p.onze)].sort((a, b) => a - b));
    const pire = r.pires[0];
    expect(pire.manques.length).toBeGreaterThan(0);
    expect(pire.manques.length + Math.round(pire.onze * 11)).toBe(11);       // les manques sont le complement des bons
    expect(pire.fauxPositifs.length).toBe(pire.manques.length);
    expect(pire).toMatchObject({ equipe: expect.stringMatching(/^Club \d/), adversaire: expect.stringMatching(/^Club \d/) });
    // Les joueurs les plus difficiles a lire : ceux dont le modele ne sait presque rien (proche du pile ou face, perte ~ 0,69).
    expect(r.difficiles.length).toBeGreaterThan(0);
    expect(r.difficiles.length).toBeLessThanOrEqual(12);
    expect(r.difficiles.every((j) => j.matchs >= 6 && j.perteMoyenne > 0)).toBe(true);
    expect(r.difficiles.map((j) => j.perteMoyenne)).toEqual([...r.difficiles.map((j) => j.perteMoyenne)].sort((a, b) => b - a));
    expect(r.difficiles[0].perteMoyenne).toBeGreaterThan(0.55);
    expect(r.difficiles[0]).toMatchObject({ nom: expect.any(String), equipe: expect.stringMatching(/^Club \d/), titularisations: expect.any(Number) });
  });

  it("les titulaires inconnus de l'equipe (nouveaux joueurs) sont comptes a part : imprevisibles par nature", async () => {
    const e = ligue({ clubs: 4, semaines: 10 });
    // A partir de la semaine 6, le gardien de chaque club est remplace par un joueur jamais vu.
    const jeu = construireJeuDonnees(e);
    for (const etape of jeu.etapes.slice(5)) {
      for (const f of etape.feuilles) f.lignes = f.lignes.map((l) => (l.numero === 1 && l.titulaire ? { ...l, joueur: `nouveau-${etape.indice}-${f.equipe}`, nom: "Nouveau GB" } : l));
    }
    const r = await entrainer(jeu, { grille: UN_SEUL });
    expect(r.nouveaux!).toBeGreaterThan(0.03);
    expect(r.pires.some((p) => p.manques.some((m) => m.proba === null && m.nom === "Nouveau GB"))).toBe(true);
  });
});

describe("entrainer : dispositifs saisis", () => {
  it("avec des dispositifs saisis : le modele de systeme apprend et se compare aux references", async () => {
    const e = ligue({ clubs: 8, semaines: 25, formation: "4-3-3" });
    const r = await entrainer(construireJeuDonnees(e), { grille: UN_SEUL });
    expect(r.systeme).not.toBeNull();
    expect(r.systeme!.n).toBeGreaterThan(100);
    expect(r.systeme!.modele.top1!).toBeGreaterThan(0.9);                    // toujours le meme dispositif : trivial a apprendre
    expect(r.systeme!.modele.top3!).toBeGreaterThanOrEqual(r.systeme!.modele.top1!);
    expect(r.systeme!.dernier.top1!).toBeGreaterThan(0.9);
    expect(r.systeme!.moteur.top3).toBeNull();                               // une reference n'a pas de top 3
    expect(r.poids.systeme).not.toBeNull();
    expect(r.poids.systemeRetenu).toBe(true);                                // au moins aussi bien que le moteur a regles : utilise en direct
    expect(r.poids.frequencesSysteme["4-3-3"]).toBeGreaterThan(100);
  });

  it("sans dispositif saisi : pas de resultat de systeme, poids du systeme absents", async () => {
    const r = await entrainer(construireJeuDonnees(ligue({ clubs: 4, semaines: 8 })), { grille: UN_SEUL });
    expect(r.systeme).toBeNull();
    expect(r.poids.systeme).toBeNull();
    expect(r.poids.systemeRetenu).toBe(false);
  });
});

describe("entrainer : donnees insuffisantes", () => {
  it("moins de deux semaines : erreur claire", async () => {
    await expect(entrainer(construireJeuDonnees(ligue({ clubs: 4, semaines: 1 })), { grille: UN_SEUL })).rejects.toThrow(DonneesInsuffisantes);
    await expect(entrainer(construireJeuDonnees({ matchs: [], equipes: [], clubs: [], compos: [] }))).rejects.toThrow(/au moins deux semaines/);
  });

  it("des semaines mais aucune equipe n'a d'historique : erreur claire", async () => {
    // Chaque club ne joue qu'une fois : personne n'a jamais d'historique.
    const e = ligue({ clubs: 4, semaines: 1 });
    const autre = ligue({ clubs: 4, semaines: 1, prefixe: "z", saisonId: "s25" });
    autre.clubs = [0, 1, 2, 3].map((i) => ({ id: `d${i}`, nom: `Club D${i}` }));
    autre.equipes = [0, 1, 2, 3].map((i) => ({ id: `ed${i}`, clubId: `d${i}`, categorie: "Seniors", division: "D2", nom: "Seniors D2", saisonId: "s25" }));
    for (const m of autre.matchs) {
      m.clubDom = m.clubDom.replace("c", "d"); m.clubExt = m.clubExt.replace("c", "d");
      m.equipeDomId = m.equipeDomId!.replace(/^e(\d)-s25$/, "ed$1"); m.equipeExtId = m.equipeExtId!.replace(/^e(\d)-s25$/, "ed$1");
      m.date = "13/09/2025";
    }
    for (const c of autre.compos) c.licence = `D${c.licence}`;
    const jeu = construireJeuDonnees({ matchs: [...e.matchs, ...autre.matchs], equipes: [...e.equipes, ...autre.equipes], clubs: [...e.clubs, ...autre.clubs], compos: [...e.compos, ...autre.compos] });
    expect(jeu.etapes.length).toBe(2);
    await expect(entrainer(jeu, { grille: UN_SEUL })).rejects.toThrow(/aucune equipe n'a d'historique/i);
  });
});

describe("entrainer : face au modele actif", () => {
  const entrees = ligue({ clubs: 6, semaines: 16, graine: 7 });
  const avant = construireJeuDonnees({ ...entrees, matchs: entrees.matchs.filter((m) => Number(m.journee) <= 10) });
  const tout = construireJeuDonnees(entrees);

  it("sans modele actif : pas de comparaison", async () => {
    expect((await entrainer(tout, { grille: UN_SEUL })).comparaison).toBeNull();
  });

  it("mesure l'actif (poids figes) et le nouveau (marche avant) sur les memes feuilles, posterieures a ce que l'actif avait vu", async () => {
    const actif = await entrainer(avant, { grille: UN_SEUL });
    const apres = avant.resume.derniereSemaine!;
    const r = await entrainer(tout, { grille: UN_SEUL, reference: { id: "m1", nom: "Modele n°1", poids: actif.poids, apres } });
    expect(r.comparaison).toMatchObject({ actif: { id: "m1", nom: "Modele n°1" }, semaines: 6 });
    expect(r.comparaison!.depuis).toMatch(/^Semaine du /);
    // Six semaines, six clubs : 36 feuilles (moins celles de moins de onze titulaires), predites par les deux.
    expect(r.comparaison!.feuilles).toBeGreaterThanOrEqual(28);
    expect(r.comparaison!.feuilles).toBeLessThanOrEqual(36);
    for (const m of [r.comparaison!.nouveau, r.comparaison!.ancien]) {
      expect(m.onze!).toBeGreaterThan(0.5);
      expect(m.perte!).toBeGreaterThan(0);
    }
    // Un modele actif correct et un nouveau qui a vu plus de donnees : du meme ordre de grandeur.
    expect(Math.abs(r.comparaison!.nouveau.onze! - r.comparaison!.ancien.onze!)).toBeLessThan(0.1);
  });

  it("l'actif est mesure avec ses poids figes (sans fuite) : un actif a l'envers est nettement battu", async () => {
    const envers = poidsInitiaux(HYPER_PAR_DEFAUT);
    envers.titularisation = { ...envers.titularisation, w: envers.titularisation.w.map((x) => -x) };
    const figes = JSON.stringify(envers);
    const apres = avant.resume.derniereSemaine!;
    const r = await entrainer(tout, { grille: UN_SEUL, reference: { id: "envers", nom: "A l'envers", poids: envers, apres } });
    expect(r.comparaison!.nouveau.onze!).toBeGreaterThan(r.comparaison!.ancien.onze! + 0.2);
    expect(JSON.stringify(envers)).toBe(figes);                             // l'entrainement n'a pas touche aux poids de l'actif
  });

  it("aucune semaine apres celles de l'actif : pas de comparaison", async () => {
    const actif = await entrainer(tout, { grille: UN_SEUL });
    const r = await entrainer(tout, { grille: UN_SEUL, reference: { id: "m1", nom: "Modele n°1", poids: actif.poids, apres: tout.resume.derniereSemaine! } });
    expect(r.comparaison).toBeNull();
  });

  it("le resume d'un modele garde la derniere semaine qu'il a vue", async () => {
    const r = await entrainer(avant, { grille: UN_SEUL });
    expect(resumeDuResultat(r)).toMatchObject({ derniereSemaine: avant.resume.derniereSemaine, systemeRetenu: false });
  });
});

describe("resumeDuResultat", () => {
  it("le resume d'un modele : precision, meilleure reference, nombre de predictions", async () => {
    const r = await entrainer(construireJeuDonnees(ligue({ clubs: 6, semaines: 12 })), { grille: UN_SEUL });
    const s = resumeDuResultat(r);
    expect(s).toMatchObject({ feuilles: r.donnees.feuilles, semaines: 12, predictions: r.global.modele.n, onze: r.global.modele.onze, systemeAppris: false });
    expect(["dernier", "moteur", "frequence"]).toContain(s.reference);
    expect(s.referenceOnze).toBe(r.global[s.reference!].onze);
    expect(s.hyper).toEqual(r.hyper);
  });
});
