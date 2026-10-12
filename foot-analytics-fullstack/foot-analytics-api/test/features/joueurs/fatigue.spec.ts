import {
  calculerFatigue, EntreeFatigue, Effort, facteursPrincipaux, niveauDe, pressionAcwr, RPE_MATCH,
} from "@/features/joueurs/fatigue";

// Mercredi 14 octobre 2026, 12h : "aujourd'hui" des scenarios.
const NOW = new Date(2026, 9, 14, 12, 0, 0);
const ilYa = (jours: number) => new Date(NOW.getTime() - jours * 86_400_000);

const seance = (jours: number, ua = 513): Effort => ({ date: ilYa(jours), ua, source: "entrainement" });
const match = (jours: number, minutes = 90): Effort => ({ date: ilYa(jours), ua: minutes * RPE_MATCH, source: "match", minutes });

const entree = (efforts: Effort[], extra: Partial<EntreeFatigue> = {}): EntreeFatigue => ({
  aujourdhui: NOW, efforts, indisponible: false, enReprise: false, blessuresAnt: 0, sources: "complet", ...extra,
});

/** Un mois type : 2 seances (mardi, jeudi) + 1 match le dimanche, chaque semaine. */
function moisRegulier(): Effort[] {
  const e: Effort[] = [];
  for (let sem = 0; sem < 4; sem++) {
    e.push(seance(1 + sem * 7 + 0.1), seance(-1 + 7 + sem * 7 - 0.1 + 0), match(3 + sem * 7));
  }
  return e.filter((x) => x.date.getTime() <= NOW.getTime());
}

describe("pressionAcwr", () => {
  it("courbe croissante : sous-charge basse, sweet spot au milieu, surcharge tres haute", () => {
    expect(pressionAcwr(0.3)).toBeLessThan(25);
    expect(pressionAcwr(1.0)).toBeGreaterThanOrEqual(45);
    expect(pressionAcwr(1.0)).toBeLessThan(65);
    expect(pressionAcwr(1.4)).toBeGreaterThanOrEqual(65);
    expect(pressionAcwr(2.0)).toBeGreaterThanOrEqual(80);
    expect(pressionAcwr(5)).toBe(95);
    // Croissante partout.
    const pts = [0.2, 0.5, 0.8, 1.0, 1.3, 1.5, 1.7];
    for (let i = 1; i < pts.length; i++) expect(pressionAcwr(pts[i])).toBeGreaterThanOrEqual(pressionAcwr(pts[i - 1]));
  });
});

describe("niveauDe", () => {
  it.each([[10, "frais"], [34, "frais"], [35, "normal"], [54, "normal"], [55, "charge"], [74, "charge"], [75, "surcharge"], [100, "surcharge"]])(
    "%i -> %s", (score, niveau) => expect(niveauDe(score)).toBe(niveau),
  );
});

describe("calculerFatigue - cas sans score", () => {
  it("joueur indisponible : pas de score, la raison est donnee", () => {
    const r = calculerFatigue(entree(moisRegulier(), { indisponible: true }));
    expect(r).toMatchObject({ score: null, niveau: null, raison: "indisponible" });
  });
  it("aucun effort sur 28 jours : pas de score, jamais un 50 invente", () => {
    expect(calculerFatigue(entree([]))).toMatchObject({ score: null, raison: "aucune_donnee" });
    expect(calculerFatigue(entree([seance(40), match(60)]))).toMatchObject({ score: null, raison: "aucune_donnee" });
  });
  it("les efforts a venir sont ignores", () => {
    expect(calculerFatigue(entree([seance(-2)])).score).toBeNull();
  });
});

describe("calculerFatigue - scenarios", () => {
  it("semaine reguliere, 2 jours apres le match : niveau normal, ACWR proche de 1", () => {
    const r = calculerFatigue(entree(moisRegulier()));
    expect(r.acwr).not.toBeNull();
    expect(r.acwr!).toBeGreaterThan(0.85);
    expect(r.acwr!).toBeLessThan(1.15);
    expect(r.niveau).toBe("normal");
    expect(r.fiabilite).toBe("solide");
  });

  it("le lendemain d'un match plein, la fatigue est plus haute que 5 jours apres", () => {
    const base = [seance(20), seance(13), seance(6), match(21), match(14), match(7)];
    const lendemain = calculerFatigue(entree([...base, match(1)]));
    const cinqJours = calculerFatigue(entree([...base, match(5)]));
    expect(lendemain.score!).toBeGreaterThan(cinqJours.score!);
  });

  it("deux matchs pleins dans la semaine : congestion maximale et niveau charge ou surcharge", () => {
    const r = calculerFatigue(entree([...moisRegulier(), match(0.5), match(3.5)]));
    const congestion = r.facteurs.find((f) => f.cle === "congestion")!;
    expect(congestion.pression).toBe(100);
    expect(["charge", "surcharge"]).toContain(r.niveau);
  });

  it("pic de charge (semaine 2 fois plus lourde que d'habitude) : ACWR > 1,5 et score eleve", () => {
    const regulier = [seance(22), seance(20), match(19), seance(15), seance(13), match(12), seance(8.5), match(8)];
    const pic = [seance(6), seance(5), seance(4), seance(3), seance(2), match(1), seance(0.2)];
    const r = calculerFatigue(entree([...regulier, ...pic]));
    expect(r.acwr!).toBeGreaterThan(1.5);
    expect(r.score!).toBeGreaterThanOrEqual(65);
  });

  it("repos complet depuis 10 jours apres un mois normal : frais", () => {
    const r = calculerFatigue(entree([seance(27), seance(25), match(24), seance(20), seance(18), match(17), seance(13), seance(12), match(11)]));
    expect(r.niveau).toBe("frais");
    expect(r.acwr).toBe(0);
  });

  it("plus de charge, plus de fatigue : monotone quand on ajoute des efforts recents", () => {
    let efforts: Effort[] = moisRegulier();
    let precedent = calculerFatigue(entree(efforts)).score!;
    for (const ajout of [seance(0.5, 700), match(0.6, 90), seance(0.7, 600)]) {
      efforts = [...efforts, ajout];
      const s = calculerFatigue(entree(efforts)).score!;
      expect(s).toBeGreaterThanOrEqual(precedent);
      precedent = s;
    }
  });
});

describe("calculerFatigue - historique court et fiabilite", () => {
  it("debut de saison (moins de 2 semaines de donnees) : pas de faux ACWR de 1,5, estimation partielle", () => {
    const r = calculerFatigue(entree([seance(5), seance(3), match(1)]));
    expect(r.acwr).toBeNull();
    expect(r.facteurs.find((f) => f.cle === "acwr")!.pression).toBe(50);   // neutre, pas alarmiste
    expect(r.fiabilite).toBe("partielle");
    expect(r.score).not.toBeNull();
  });

  it("adversaire (matchs seuls) : score calcule mais toujours une estimation", () => {
    const r = calculerFatigue(entree([match(20), match(13), match(6), match(0.5)], { sources: "matchs" }));
    expect(r.score).not.toBeNull();
    expect(r.fiabilite).toBe("partielle");
    expect(r.minutes7j).toBe(180);
    expect(r.matchs14j).toBe(3);
  });
});

describe("calculerFatigue - vulnerabilite", () => {
  const efforts = moisRegulier();
  it("les antecedents de blessure, un retour recent et l'age augmentent le score", () => {
    const sain = calculerFatigue(entree(efforts)).score!;
    expect(calculerFatigue(entree(efforts, { blessuresAnt: 2 })).score!).toBeGreaterThan(sain);
    expect(calculerFatigue(entree(efforts, { enReprise: true })).score!).toBeGreaterThan(sain);
    expect(calculerFatigue(entree(efforts, { finDerniereBlessure: ilYa(5) })).score!).toBeGreaterThan(sain);
    expect(calculerFatigue(entree(efforts, { age: 36 })).score!).toBeGreaterThan(sain);
  });
  it("une blessure guerie depuis plus de 14 jours ne compte plus comme retour recent", () => {
    const sain = calculerFatigue(entree(efforts)).score!;
    expect(calculerFatigue(entree(efforts, { finDerniereBlessure: ilYa(30) })).score).toBe(sain);
  });
  it("la vulnerabilite pese au plus 10 points sur 100", () => {
    const sain = calculerFatigue(entree(efforts)).score!;
    const tout = calculerFatigue(entree(efforts, { blessuresAnt: 9, enReprise: true, age: 40 })).score!;
    expect(tout - sain).toBeLessThanOrEqual(10);
  });
});

describe("calculerFatigue - decomposition", () => {
  it("le score est la somme arrondie des points des facteurs, et les poids font 100 %", () => {
    const r = calculerFatigue(entree(moisRegulier(), { blessuresAnt: 1 }));
    expect(r.facteurs).toHaveLength(4);
    expect(r.facteurs.reduce((s, f) => s + f.poids, 0)).toBeCloseTo(1, 5);
    expect(r.score).toBe(Math.round(r.facteurs.reduce((s, f) => s + f.points, 0)));
    for (const f of r.facteurs) expect(f.detail.length).toBeGreaterThan(5);
  });
  it("facteursPrincipaux : les plus lourds d'abord", () => {
    const r = calculerFatigue(entree([...moisRegulier(), match(0.4), match(3)]));
    const [premier, second] = facteursPrincipaux(r, 2);
    expect(premier.points).toBeGreaterThanOrEqual(second.points);
  });
  it("aucune donnee n'est lue sur la date du jour reelle : meme entree, meme resultat", () => {
    expect(calculerFatigue(entree(moisRegulier()))).toEqual(calculerFatigue(entree(moisRegulier())));
  });
});
