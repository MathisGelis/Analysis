import { construireJeuDonnees } from "@/features/ia/ia-donnees";
import { classerGroupes, ligneGroupe, agregatsVides, noter } from "@/features/ia/ia-evaluation";
import { voisins, GRILLE_COMPLETE } from "@/features/ia/ia-entrainement";
import { disponibiliteDesJoueurs, feuillesDeLEquipe } from "@/features/ia/ia-live";
import { CARACTERISTIQUES_TITULAIRE, poidsInitiaux, predireOnze, preparerCandidats } from "@/features/ia/ia-modele";
import { serialiserEntreePourTest } from "./ia-disponibilite.support";
import { ligue } from "./ligue";

const idx = (id: string) => CARACTERISTIQUES_TITULAIRE.findIndex((c) => c.id === id);

describe("feuilles : cartons, blessures, categorie", () => {
  const base = ligue({ clubs: 4, semaines: 4, absence: 0 });
  const feuilleDe = (e: ReturnType<typeof ligue>) => construireJeuDonnees(e).feuilles.filter((f) => f.libelleEquipe.startsWith("Club 0 "));

  it("un carton rouge ou un second jaune de l'evenement marque la ligne du joueur de son equipe, un jaune aussi", () => {
    const m0 = base.matchs[0];
    const cote = base.compos.find((c) => c.matchId === m0.id && c.nom === "JOUEUR0X3")!.cote;
    const sansEvenement = feuilleDe(base)[0];
    expect(sansEvenement.lignes.every((l) => l.rouge === undefined)).toBe(true);        // evenements non fournis : on ne sait pas

    const avec = feuilleDe({
      ...base,
      evenements: [
        { matchId: m0.id, type: "carton", sousType: "rouge", equipe: cote, joueur: "JOUEUR0X3 P3" },
        { matchId: m0.id, type: "carton", sousType: "jaune", equipe: cote, joueur: "JOUEUR0X4 P4" },
      ],
    })[0];
    expect(avec.lignes.find((l) => l.nom.endsWith("JOUEUR0X3"))).toMatchObject({ rouge: true, jaune: false });
    expect(avec.lignes.find((l) => l.nom.endsWith("JOUEUR0X4"))).toMatchObject({ rouge: false, jaune: true });
    expect(avec.lignes.find((l) => l.nom.endsWith("JOUEUR0X5"))).toMatchObject({ rouge: false, jaune: false });
  });

  it("une blessure ne compte que le jour de couverture ; la reprise est a part ; la categorie suit l'equipe", () => {
    const jeu0 = construireJeuDonnees(base);
    const cle = jeu0.feuilles[0].lignes.find((l) => l.nom.endsWith("JOUEUR0X3"))!.joueur;
    const f = feuilleDe({
      ...base,
      blessures: [
        { joueur: cle, dateDebut: "01/09/2025", retourEstime: "14/09/2025", statut: "Indisponible" },
        { joueur: "lic:autre", dateDebut: "01/09/2025", retourEstime: "14/09/2025", statut: "Reprise" },
      ],
    });
    expect(f[0].disponibilite).toEqual({ absents: [cle], reprise: ["lic:autre"] });     // match du 06/09
    expect(f[f.length - 1].disponibilite).toBeUndefined();                              // plus tard : retabli
    expect(f[0].categorie).toBe("seniors");
  });
});

describe("le modele lit la disponibilite et le dernier match", () => {
  const jeu = construireJeuDonnees({ ...ligue({ clubs: 4, semaines: 8, absence: 0 }) });
  const hist = jeu.feuilles.filter((f) => f.libelleEquipe.startsWith("Club 0 ")).reverse();
  const cleDe = (nom: string) => hist[0].lignes.find((l) => l.nom.endsWith(nom))!.joueur;

  it("un joueur blesse ce jour-la est deprecie, un joueur sorti tot ou expulse au dernier match le suit", () => {
    const cle = cleDe("JOUEUR0X3");
    const sans = preparerCandidats(hist, "s25", 10);
    const avec = preparerCandidats(hist, "s25", 10, { absents: new Set([cle]), reprise: new Set() });
    expect(sans.candidats.find((c) => c.joueur === cle)!.x[idx("indisponible")]).toBe(0);
    expect(avec.candidats.find((c) => c.joueur === cle)!.x[idx("indisponible")]).toBe(1);
    const poids = poidsInitiaux();
    expect(predireOnze(poids, avec)!.probas.get(cle)!).toBeLessThan(0.1);
    expect(predireOnze(poids, sans)!.probas.get(cle)!).toBeGreaterThan(0.5);

    const marquee = hist.map((f, i) => i === 0 ? { ...f, lignes: f.lignes.map((l) => l.joueur === cle ? { ...l, rouge: true, jaune: true, minutes: 40 } : l) } : f);
    const x = preparerCandidats(marquee, "s25", 10).candidats.find((c) => c.joueur === cle)!.x;
    expect(x[idx("rougeDernier")]).toBe(1);
    expect(x[idx("sortiTot")]).toBe(1);
    expect(x[idx("jaunesRecents")]).toBeGreaterThan(0);
    expect(predireOnze(poidsInitiaux(), preparerCandidats(marquee, "s25", 10))!.probas.get(cle)!).toBeLessThan(0.1);
  });

  it("un modele enregistre avant ces caracteristiques continue de fonctionner (poids absents = 0)", () => {
    const ancien = poidsInitiaux();
    const n = CARACTERISTIQUES_TITULAIRE.length - 7;
    ancien.titularisation = { noms: ancien.titularisation.noms.slice(0, n), w: ancien.titularisation.w.slice(0, n) };
    const prep = preparerCandidats(hist, "s25", 10, { absents: new Set([cleDe("JOUEUR0X3")]) });
    expect(predireOnze(ancien, prep)!.titulaires).toHaveLength(11);
  });

  it("au direct, les cartons des evenements du match sont lus comme a l'entrainement", () => {
    const m = { id: "x", date: "06/09/2025", journee: "1", saisonId: "s25", evenements: [{ type: "carton", sousType: "rouge", equipe: "dom", joueur: "DUPONT Luc" }] };
    const titulaires = Array.from({ length: 11 }, (_, i) => ({ nom: i === 0 ? "DUPONT" : `N${i}`, prenom: i === 0 ? "Luc" : "X", licence: `L${i}`, numero: i + 1, titulaire: true, minutes: 90 }));
    const [f] = feuillesDeLEquipe([{ m, dom: true, titulaires, bancs: [] }]);
    expect(f.lignes[0]).toMatchObject({ rouge: true });
    expect(f.lignes[1]).toMatchObject({ rouge: false });
  });
});

describe("disponibilite des joueurs du club", () => {
  it("indisponible et en reprise, relus de la fiche de fatigue, sous la meme cle que les feuilles", () => {
    const d = disponibiliteDesJoueurs([
      { licence: "L1", nom: "A", prenom: "a", fatigueEntree: serialiserEntreePourTest({ indisponible: true }) },
      { licence: null, nom: "B", prenom: "b", fatigueEntree: serialiserEntreePourTest({ enReprise: true }) },
      { licence: "L3", nom: "C", prenom: "c", fatigueEntree: serialiserEntreePourTest({}) },
      { licence: "L4", nom: "D", prenom: "d", fatigueEntree: null },
    ]);
    expect(d.absents.size).toBe(1);
    expect([...d.absents][0]).toMatch(/^lic:/);

    expect([...d.reprise][0]).toMatch(/^nom:/);
  });
});

describe("mesure par equipe et reglages voisins", () => {
  const note = (onze: number) => ({ onze, postes: null });
  const agregats = (modele: number, dernier: number, n = 4) => {
    const a = agregatsVides();
    for (let i = 0; i < n; i++) { a.modele.ajouter(note(modele)); a.dernier.ajouter(note(dernier)); }
    return a;
  };

  it("ligne de groupe : ecart face a la meilleure reference, classement du plus mal servi au mieux servi", () => {
    const bon = ligneGroupe("Bon", "seniors", agregats(0.8, 0.6));
    const mauvais = ligneGroupe("Mauvais", "seniors", agregats(0.5, 0.7));
    const peu = ligneGroupe("Peu", "u17", agregats(0.1, 0.9, 2));
    expect(bon).toMatchObject({ ecart: 0.2, reference: "dernier", referenceOnze: 0.6 });
    expect(mauvais.ecart).toBe(-0.2);
    expect(classerGroupes([bon, peu, mauvais]).map((l) => l.nom)).toEqual(["Mauvais", "Bon"]);   // 2 predictions : trop peu
    expect(noter(new Map(), [])).toEqual({ onze: 0, postes: null });
  });

  it("voisins : un cran sur chaque axe, jamais hors des bornes", () => {
    expect(voisins({ fenetre: 10, l2: 3, demiVie: null })).toEqual([
      { fenetre: 8, l2: 3, demiVie: null }, { fenetre: 14, l2: 3, demiVie: null },
      { fenetre: 10, l2: 1, demiVie: null }, { fenetre: 10, l2: 10, demiVie: null },
      { fenetre: 10, l2: 3, demiVie: 6 },
    ]);
    expect(voisins({ fenetre: 4, l2: 0.1, demiVie: 24 })).toEqual([
      { fenetre: 6, l2: 0.1, demiVie: 24 }, { fenetre: 4, l2: 0.3, demiVie: 24 }, { fenetre: 4, l2: 0.1, demiVie: 12 },
    ]);
    expect(GRILLE_COMPLETE.length).toBe(12);
  });
});
