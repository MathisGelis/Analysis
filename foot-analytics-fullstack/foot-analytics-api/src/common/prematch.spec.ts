import { EntreePistes, faceAFace, Piste, pistesPrematch, profilEquipe } from "./prematch";
import { MatchTendance } from "./tendances";

let n = 0;
/** Les dates suivent l'ordre de la serie (jour i + 1 de novembre 2025) : la chronologie ne depend pas du compteur. */
const match = (bp: number, bc: number, domicile = true, rang = 0): MatchTendance => ({
  matchId: `m${++n}`, date: `${String(rang + 1).padStart(2, "0")}/11/2025`, journee: String(rang + 1), domicile,
  adversaireId: null, bp, bc, cartonsJaunes: 0, cartonsRouges: 0, minutesCartons: [], minutesButsPour: [], minutesButsContre: [], titulaires: null,
});
const serie = (scores: [number, number][], domicile: (i: number) => boolean = () => true) => scores.map(([a, b], i) => match(a, b, domicile(i), i));

describe("profilEquipe", () => {
  it("chiffre le rythme, les buts, le domicile / l'exterieur et la forme recente", () => {
    const ms = serie([[2, 0], [1, 0], [3, 1], [0, 0], [2, 2], [1, 0], [0, 1], [2, 0]], (i) => i % 2 === 0);
    const p = profilEquipe("Adverse", ms, { rang: 3, pts: 20 });
    expect(p).toMatchObject({ nom: "Adverse", matchs: 8, rang: 3, pts: 20 });
    expect(p.ppm).toBeCloseTo(17 / 8 - 0.0, 1);       // 5 V + 2 N + 1 D = 17 pts : 2,13 par match
    expect(p.bpm).toBe(1.38);
    expect(p.formeRecente).toHaveLength(5);
    expect(p.domicile.joues + p.exterieur.joues).toBe(8);
  });
  it("sous le seuil d'echantillon : pas de sens de tendance", () => {
    expect(profilEquipe("X", serie([[1, 0], [1, 0]])).sens).toBe("insuffisant");
  });
  it("serie en cours : a partir de 3 matchs seulement", () => {
    expect(profilEquipe("X", serie([[0, 1], [0, 1], [1, 0], [1, 0]])).serie).toBeNull();
    expect(profilEquipe("X", serie([[0, 1], [1, 0], [1, 0], [2, 0]])).serie).toMatchObject({ longueur: 3 });
  });
});

describe("faceAFace", () => {
  it("la plus recente d'abord, bilan vu de mon equipe", () => {
    const r = faceAFace([
      { matchId: "a", date: "05/10/2025", journee: "5", domicile: true, bp: 2, bc: 1 },
      { matchId: "b", date: "15/03/2026", journee: "19", domicile: false, bp: 0, bc: 0 },
      { matchId: "c", date: "20/01/2025", journee: "2", domicile: false, bp: 0, bc: 3 },
    ]);
    expect(r.rencontres.map((x) => x.matchId)).toEqual(["b", "a", "c"]);
    expect(r.bilan).toMatchObject({ joues: 3, v: 1, n: 1, d: 1, bp: 2, bc: 4 });
    expect(r.rencontres[0].issue).toBe("N");
  });
  it("aucune rencontre : bilan vide", () => {
    expect(faceAFace([])).toMatchObject({ rencontres: [], bilan: { joues: 0, v: 0, n: 0, d: 0 } });
  });
});

describe("pistesPrematch", () => {
  const base = (over: Partial<EntreePistes> = {}, adv: Partial<EntreePistes["adv"]> = {}, moi: Partial<EntreePistes["moi"]> = {}): EntreePistes => {
    // Une equipe banale : V D N V puis V D N V (memes points en debut et en fin de saison : tendance stable),
    // 1,5 but marque et 1,25 encaisse par match, aucune serie remarquable.
    const profil = (nom: string) => profilEquipe(nom, serie([[2, 1], [1, 2], [1, 1], [2, 1], [2, 1], [1, 2], [1, 1], [2, 1]], (i) => i % 2 === 0));
    return {
      moi: { ...profil("Nous"), ...moi }, adv: { ...profil("Adverse"), ...adv }, advJoue: null, advRapport: null, arbitre: null,
      faceAFace: { joues: 0, v: 0, n: 0, d: 0 }, ...over,
    };
  };
  const titres = (ps: Piste[]) => ps.map((x) => x.titre);

  it("equipes equivalentes : aucune piste inventee", () => {
    expect(pistesPrematch(base())).toEqual([]);
  });

  it("defense permeable et attaque en panne sont des atouts, defense solide et attaque prolifique des vigilances", () => {
    const ps = pistesPrematch(base({}, { bcm: 2.1, bpm: 0.8 }));
    expect(ps.find((x) => x.titre === "Defense permeable")).toMatchObject({ ton: "atout" });
    expect(ps.find((x) => x.titre === "Attaque en panne")).toMatchObject({ ton: "atout" });
    const ps2 = pistesPrematch(base({}, { bcm: 0.6, bpm: 2.6 }));
    expect(ps2.find((x) => x.titre === "Defense tres solide")).toMatchObject({ ton: "vigilance" });
    expect(ps2.find((x) => x.titre === "Attaque prolifique")).toMatchObject({ ton: "vigilance" });
  });

  it("jamais de conclusion sur moins de 6 matchs", () => {
    expect(pistesPrematch(base({}, { matchs: 4, bcm: 3, bpm: 3, ppm: 0.2 }))).toEqual([]);
  });

  it("rythme compare : meilleur ou moins bon que nous, a partir de 0,5 point par match d'ecart", () => {
    expect(titres(pistesPrematch(base({}, { ppm: 1.0 }, { ppm: 1.8 })))).toContain("Nous sommes sur un meilleur rythme");
    expect(titres(pistesPrematch(base({}, { ppm: 2.2 }, { ppm: 1.4 })))).toContain("Adversaire sur un meilleur rythme");
    expect(pistesPrematch(base({}, { ppm: 1.5 }, { ppm: 1.7 }))).toEqual([]);
  });

  it("lieu du match : redoutable chez lui, ou fragile en deplacement", () => {
    const fort = base({ advJoue: "domicile" }, { domicile: { joues: 5, ppm: 2.4 }, exterieur: { joues: 5, ppm: 1.0 } });
    expect(pistesPrematch(fort).find((x) => x.titre === "Redoutable a domicile")).toMatchObject({ ton: "vigilance" });
    const faible = base({ advJoue: "exterieur" }, { domicile: { joues: 5, ppm: 2.4 }, exterieur: { joues: 5, ppm: 1.0 } });
    expect(pistesPrematch(faible).find((x) => x.titre === "Moins a l'aise a l'exterieur")).toMatchObject({ ton: "atout" });
    // Trop peu de matchs a l'exterieur : pas de conclusion.
    const peu = base({ advJoue: "exterieur" }, { domicile: { joues: 5, ppm: 2.4 }, exterieur: { joues: 2, ppm: 0 } });
    expect(pistesPrematch(peu)).toEqual([]);
  });

  it("dynamique et serie en cours", () => {
    const ps = pistesPrematch(base({}, { sens: "hausse", libelle: "Tres bonne dynamique", serie: { type: "victoires", longueur: 4 } }));
    expect(titres(ps)).toEqual(expect.arrayContaining(["En confiance", "Belle serie en cours"]));
    const ps2 = pistesPrematch(base({}, { sens: "baisse", serie: { type: "sans_victoire", longueur: 5 } }));
    expect(ps2.find((x) => x.titre === "Serie difficile en cours")?.detail).toBe("5 matchs sans victoire.");
  });

  it("rapport detaille : dependance a un joueur, equipe qui se crispe, onze instable, fatigue", () => {
    const ps = pistesPrematch(base({
      advRapport: {
        scoreChaos: 70, fatigueMoy: 64, cartonsAvecMinute: 12, partFinDeMatch: 0.5, matchsSerres: 6, matchsAnalyses: 10,
        faiblesses: [
          { niveau: "alerte", titre: "Forte dependance a Jean DUPONT", detail: "Sans lui : 1.00 pts/match. Avec lui : 2.50 pts/match." },
          { niveau: "alerte", titre: "Defense permeable", detail: "doublon" },
          { niveau: "info", titre: "Numero 4 : pas de titulaire fixe", detail: "..." },
        ],
      },
    }));
    const t = titres(ps);
    expect(t).toEqual(expect.arrayContaining(["Dependance a Jean DUPONT", "Onze difficile a prevoir", "Se crispe en fin de match", "Titulaires tres sollicites", "Matchs tres fermes"]));
    expect(t).not.toContain("Defense permeable");                       // deja couverte par les chiffres bruts
    expect(t.some((x) => /Numero 4/.test(x))).toBe(false);              // les infos de faible niveau ne sont pas des pistes
  });

  it("arbitre : severe ou permissif, seulement avec assez de matchs", () => {
    expect(titres(pistesPrematch(base({ arbitre: { nom: "DUPONT", profil: "Strict", matchsPrincipal: 6, cartonsParMatch: 5.2 } })))).toContain("Arbitre severe");
    expect(titres(pistesPrematch(base({ arbitre: { nom: "DUPONT", profil: "Permissif", matchsPrincipal: 6, cartonsParMatch: 1.1 } })))).toContain("Arbitre permissif");
    expect(pistesPrematch(base({ arbitre: { nom: "DUPONT", profil: "Strict", matchsPrincipal: 2, cartonsParMatch: 6 } }))).toEqual([]);
  });

  it("face-a-face : bilan et derniere rencontre", () => {
    const ps = pistesPrematch(base({ faceAFace: { joues: 3, v: 1, n: 1, d: 1, derniere: { bp: 2, bc: 1, domicile: true, issue: "V" } } }));
    expect(ps[0]).toMatchObject({ ton: "info", titre: "Historique des confrontations" });
    expect(ps[0].detail).toContain("1 victoire, 1 nul, 1 defaite en 3 rencontres.");
    expect(ps[0].detail).toContain("victoire 2-1 a domicile");
  });

  it("triees par importance, limitees a 10", () => {
    const ps = pistesPrematch(base(
      { advJoue: "domicile", arbitre: { nom: "X", profil: "Strict", matchsPrincipal: 9, cartonsParMatch: 6 }, faceAFace: { joues: 2, v: 1, n: 1, d: 0 },
        advRapport: { scoreChaos: 80, fatigueMoy: 70, cartonsAvecMinute: 20, partFinDeMatch: 0.6, matchsSerres: 9, matchsAnalyses: 10,
          faiblesses: [{ niveau: "critique", titre: "Ligne Defense instable", detail: "d" }, { niveau: "alerte", titre: "Ligne Milieu instable", detail: "d" }] } },
      { bcm: 2.5, bpm: 0.5, sens: "baisse", serie: { type: "defaites", longueur: 4 }, domicile: { joues: 5, ppm: 0.5 }, exterieur: { joues: 5, ppm: 2 }, ppm: 0.6 },
    ));
    expect(ps.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < ps.length; i++) expect(ps[i - 1].importance).toBeGreaterThanOrEqual(ps[i].importance);
  });

  it("systeme probable : une piste d'information, sans chiffre invente", () => {
    const e = { ...base(), systeme: { systeme: "4-3-3", confiance: 70, observations: 5, fiabilite: "bonne" as const } };
    const piste = pistesPrematch(e).find((x) => x.titre === "Systeme probable : 4-3-3")!;
    expect(piste).toMatchObject({ ton: "info", importance: 2 });
    expect(piste.detail).toContain("5 matchs renseignes");
    expect(piste.detail).toContain("70 %");
  });

  it("systeme : un seul match renseigne, a confirmer ; aucune donnee, aucune piste", () => {
    const seul = pistesPrematch({ ...base(), systeme: { systeme: "4-4-2", confiance: 100, observations: 1, fiabilite: "faible" } });
    expect(seul.find((x) => x.titre.startsWith("Systeme probable"))!.detail).toContain("a confirmer");
    expect(pistesPrematch({ ...base(), systeme: null }).some((x) => x.titre.startsWith("Systeme probable"))).toBe(false);
    expect(pistesPrematch(base()).some((x) => x.titre.startsWith("Systeme probable"))).toBe(false);
  });
});
