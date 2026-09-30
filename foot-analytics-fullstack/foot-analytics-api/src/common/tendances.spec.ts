import {
  bilan, butsParTranche, calculerTendances, courbeForme, discipline, dynamiqueForme, genererInsights,
  lieux, MatchTendance, moities, parNiveauAdversaire, profilScores, rotation, series, tailleFenetre,
  trierChronologiquement,
} from "./tendances";

let seq = 0;
const match = (bp: number, bc: number, o: Partial<MatchTendance> = {}): MatchTendance => ({
  matchId: `m${++seq}`, date: null, journee: String(seq), domicile: true, adversaireId: `adv${seq}`,
  bp, bc, cartonsJaunes: 0, cartonsRouges: 0, minutesCartons: [], minutesButsPour: [], minutesButsContre: [],
  titulaires: null, ...o,
});
/** Serie de matchs a partir de scores "2-0", "1-1"... */
const scores = (...s: string[]) => s.map((x) => { const [a, b] = x.split("-").map(Number); return match(a, b); });

beforeEach(() => { seq = 0; });

describe("trierChronologiquement", () => {
  it("compare des dates, pas des chaines : 15/03/2026 vient apres 27/09/2025", () => {
    const ms = [match(1, 0, { date: "15/03/2026" }), match(2, 0, { date: "27/09/2025" }), match(3, 0, { date: "2026-01-10" })];
    expect(trierChronologiquement(ms).map((m) => m.bp)).toEqual([2, 3, 1]);
  });
  it("sans date : par journee, puis ordre d'arrivee ; les matchs dates passent avant", () => {
    const ms = [match(9, 0, { journee: "10" }), match(8, 0, { journee: "2" }), match(7, 0, { date: "01/01/2026", journee: "30" })];
    expect(trierChronologiquement(ms).map((m) => m.bp)).toEqual([7, 8, 9]);
  });
});

describe("bilan / courbeForme", () => {
  it("compte V N D, points, buts et moyennes", () => {
    const b = bilan(scores("2-0", "1-1", "0-3", "3-1"));
    expect(b).toMatchObject({ joues: 4, v: 2, n: 1, d: 1, pts: 7, ppm: 1.75, bp: 6, bc: 5, bpm: 1.5, bcm: 1.25 });
  });
  it("bilan vide : zeros, pas de NaN", () => {
    expect(bilan([])).toMatchObject({ joues: 0, ppm: 0, bpm: 0, bcm: 0 });
  });
  it("points cumules et moyenne glissante sur 5 matchs", () => {
    const c = courbeForme(scores("1-0", "1-0", "1-0", "0-1", "0-1", "0-1", "0-1"));
    expect(c.map((p) => p.ptsCumules)).toEqual([3, 6, 9, 9, 9, 9, 9]);
    expect(c[6].ppmGlissant).toBe(0.6);       // fenetre = matchs 3 a 7 : V, D, D, D, D -> 3 pts / 5
    expect(c[0].ppmGlissant).toBe(3);         // fenetre reduite au 1er match
  });
});

describe("dynamiqueForme", () => {
  it("sous 6 matchs : insuffisant, jamais de tendance inventee", () => {
    const f = dynamiqueForme(scores("1-0", "1-0", "1-0", "1-0", "1-0"));
    expect(f).toMatchObject({ sens: "insuffisant", score: null, fenetre: 0 });
  });
  it("fenetre : 5 matchs des 10 matchs, moins avant", () => {
    expect(tailleFenetre(20)).toBe(5);
    expect(tailleFenetre(10)).toBe(5);
    expect(tailleFenetre(6)).toBe(3);
    expect(tailleFenetre(8)).toBe(4);
  });
  it("hausse : 5 victoires apres 5 defaites", () => {
    const f = dynamiqueForme(scores("0-1", "0-1", "0-1", "0-1", "0-1", "2-0", "2-0", "2-0", "2-0", "2-0"));
    expect(f.sens).toBe("hausse");
    expect(f.recente.ppm).toBe(3);
    expect(f.avant.ppm).toBe(0);
    expect(f.ecartPpm).toBe(3);
    expect(f.attaque).toBe("hausse");
    expect(f.defense).toBe("hausse");           // encaisse moins
    expect(f.score).toBeGreaterThanOrEqual(80);
    expect(f.libelle).toBe("Tres bonne dynamique");
  });
  it("baisse : la defense qui prend l'eau est signalee dans le bon sens", () => {
    const f = dynamiqueForme(scores("2-0", "2-0", "2-0", "2-0", "2-0", "0-3", "0-3", "0-3", "0-3", "0-3"));
    expect(f.sens).toBe("baisse");
    expect(f.defense).toBe("baisse");
    expect(f.attaque).toBe("baisse");
    expect(f.score!).toBeLessThan(25);
    expect(f.libelle).toBe("En crise");
  });
  it("stable : ecart sous le seuil", () => {
    const f = dynamiqueForme(scores("1-0", "1-1", "0-1", "1-0", "1-1", "1-0", "1-1", "0-1", "1-0", "1-1"));
    expect(f.sens).toBe("stable");
  });
});

describe("series", () => {
  it("series en cours (2 matchs mini) et records", () => {
    const s = series(scores("0-1", "0-1", "2-0", "1-0", "3-0", "0-0"));
    // invaincu : 4 (V V V N) ; victoires : rompue par le nul ; sans encaisser : 4
    expect(s.enCours).toEqual(expect.arrayContaining([
      { type: "invaincu", longueur: 4 }, { type: "sans_encaisser", longueur: 4 },
    ]));
    expect(s.enCours.find((x) => x.type === "victoires")).toBeUndefined();
    expect(s.records.find((x) => x.type === "victoires")!.longueur).toBe(3);
    expect(s.records.find((x) => x.type === "defaites")!.longueur).toBe(2);
  });
  it("une serie de victoires n'est pas doublee par 'invaincu' de meme longueur", () => {
    const s = series(scores("0-1", "1-0", "2-0", "3-0"));
    expect(s.enCours.map((x) => x.type)).toContain("victoires");
    expect(s.enCours.map((x) => x.type)).not.toContain("invaincu");
  });
  it("aucune serie d'un seul match", () => {
    expect(series(scores("1-0", "0-1")).enCours.filter((s) => s.type !== "marque")).toEqual([]);
  });
});

describe("lieux / profilScores / moities", () => {
  it("ecart domicile - exterieur seulement avec 3 matchs de chaque cote", () => {
    const ms = [
      ...[1, 2, 3].map(() => match(2, 0, { domicile: true })),
      ...[1, 2, 3].map(() => match(0, 2, { domicile: false })),
    ];
    const l = lieux(ms);
    expect(l.domicile.ppm).toBe(3);
    expect(l.exterieur.ppm).toBe(0);
    expect(l.ecartPpm).toBe(3);
    expect(lieux(ms.slice(0, 5)).ecartPpm).toBeNull();
  });
  it("profil : clean sheets, matchs muets, matchs serres, gros ecarts", () => {
    const p = profilScores(scores("1-0", "0-0", "4-0", "0-3", "2-1", "0-1"));
    expect(p).toMatchObject({ matchs: 6, matchsSansEncaisser: 3, matchsSansMarquer: 3, matchsSerres: 4, grossesVictoires: 1, grossesDefaites: 1 });
    expect(p.recordMatchsSerres).toMatchObject({ joues: 4, v: 2, n: 1, d: 1 });
  });
  it("moities : null sous 8 matchs, sinon premiere et seconde", () => {
    expect(moities(scores("1-0", "1-0", "1-0", "1-0", "1-0", "1-0", "1-0"))).toBeNull();
    const m = moities(scores("0-1", "0-1", "0-1", "0-1", "1-0", "1-0", "1-0", "1-0"))!;
    expect(m.premiere.ppm).toBe(0);
    expect(m.seconde.ppm).toBe(3);
    expect(m.ecartPpm).toBe(3);
  });
});

describe("discipline / butsParTranche", () => {
  it("cartons par tranche de 15 minutes et part de fin de match", () => {
    const ms = [
      match(0, 0, { cartonsJaunes: 2, minutesCartons: [10, 80] }),
      match(0, 0, { cartonsJaunes: 1, cartonsRouges: 1, minutesCartons: [88, 45] }),
    ];
    const d = discipline(ms);
    expect(d).toMatchObject({ jaunes: 3, rouges: 1, cartonsAvecMinute: 4, partFinDeMatch: 0.5 });
    expect(d.parTranche).toEqual([1, 0, 1, 0, 0, 2]);
  });
  it("ecart des jaunes : recent contre avant", () => {
    const ms = [
      ...[1, 2, 3, 4, 5].map(() => match(1, 0, { cartonsJaunes: 0 })),
      ...[1, 2, 3, 4, 5].map(() => match(1, 0, { cartonsJaunes: 2 })),
    ];
    expect(discipline(ms)).toMatchObject({ recentJaunesParMatch: 2, avantJaunesParMatch: 0, ecartJaunes: 2 });
  });
  it("buts par tranche : indisponible quand les feuilles n'ont pas les buteurs", () => {
    const b = butsParTranche([match(3, 2), match(2, 2), match(1, 1)]);
    expect(b).toMatchObject({ disponible: false, couverture: 0 });
  });
  it("buts par tranche : disponible avec 60 % de buts dates", () => {
    const ms = [
      match(2, 1, { minutesButsPour: [5, 50], minutesButsContre: [88] }),
      match(3, 0, { minutesButsPour: [10, 20, 80] }),
      match(1, 2, { minutesButsPour: [44], minutesButsContre: [3, 70] }),
    ];
    const b = butsParTranche(ms);
    expect(b.disponible).toBe(true);
    expect(b.pour).toEqual([2, 1, 1, 1, 0, 1]);     // 5, 10 | 20 | 44 | 50 | - | 80
    expect(b.pour.reduce((s, x) => s + x, 0)).toBe(6);
    expect(b.contre[0]).toBe(1);
    expect(b.contre[5]).toBe(1);
  });
});

describe("rotation", () => {
  const xi = (...ids: number[]) => ids.map(String);
  it("compte les titulaires nouveaux par rapport au match precedent", () => {
    const r = rotation([
      match(1, 0, { titulaires: xi(1, 2, 3, 4) }),
      match(1, 0, { titulaires: xi(1, 2, 3, 5) }),
      match(1, 0, { titulaires: xi(6, 7, 3, 5) }),
    ]);
    expect(r.changements).toEqual([null, 1, 2]);
    expect(r.moyenne).toBe(1.5);
  });
  it("un match sans composition ne casse pas la chaine", () => {
    const r = rotation([
      match(1, 0, { titulaires: xi(1, 2) }), match(1, 0, { titulaires: null }), match(1, 0, { titulaires: xi(1, 3) }),
    ]);
    expect(r.changements).toEqual([null, null, 1]);
  });
  it("le onze qui bouge de plus en plus : hausse", () => {
    const ms = [
      ...[0, 1, 2, 3, 4, 5].map(() => match(1, 0, { titulaires: xi(1, 2, 3, 4, 5, 6) })),
      ...[10, 20, 30, 40, 50].map((k) => match(1, 0, { titulaires: xi(k, k + 1, k + 2, k + 3, k + 4, k + 5) })),
    ];
    expect(rotation(ms).sens).toBe("hausse");
  });
  it("trop peu de matchs : insuffisant", () => {
    expect(rotation([match(1, 0, { titulaires: xi(1) }), match(1, 0, { titulaires: xi(2) })]).sens).toBe("insuffisant");
  });
});

describe("parNiveauAdversaire", () => {
  it("tiers de la poule : haut, milieu, bas ; les matchs sans rang sont ignores", () => {
    const rangs: Record<string, number> = { a: 1, b: 2, c: 6, d: 11, e: 12 };
    const ms = [
      match(0, 2, { adversaireId: "a" }), match(1, 1, { adversaireId: "b" }),
      match(2, 0, { adversaireId: "d" }), match(3, 0, { adversaireId: "e" }),
      match(1, 0, { adversaireId: "c" }), match(4, 0, { adversaireId: "inconnu" }),
    ];
    const r = parNiveauAdversaire(ms, (m) => rangs[m.adversaireId!] ?? null, 12)!;
    expect(r.map((x) => [x.niveau, x.rangs, x.bilan.joues, x.bilan.pts])).toEqual([
      ["haut", "1-4", 2, 1], ["milieu", "5-8", 1, 3], ["bas", "9-12", 2, 6],
    ]);
  });
  it("poule trop petite ou trop peu de matchs classes : null", () => {
    expect(parNiveauAdversaire(scores("1-0", "1-0", "1-0", "1-0", "1-0"), () => 1, 4)).toBeNull();
    expect(parNiveauAdversaire(scores("1-0", "1-0"), () => 1, 12)).toBeNull();
  });
});

describe("genererInsights", () => {
  const titres = (ms: MatchTendance[], ctx = {}) => calculerTendances(ms, ctx).insights.map((i) => i.id);

  it("aucun constat sous les seuils d'echantillon", () => {
    expect(titres(scores("3-0", "2-0", "1-0"))).toEqual([]);
  });

  it("equipe qui monte : dynamique, attaque, defense, serie de victoires", () => {
    const ids = titres(scores("0-1", "0-2", "0-1", "1-2", "0-1", "3-0", "2-0", "3-0", "2-0", "3-0"));
    expect(ids).toEqual(expect.arrayContaining(["forme-hausse", "attaque-hausse", "defense-hausse", "serie-victoires"]));
  });

  it("equipe qui recule : baisse de forme et serie noire, en tons negatifs", () => {
    const ins = calculerTendances(scores("2-0", "3-0", "2-1", "1-0", "2-0", "0-2", "0-1", "1-3", "0-2", "0-2")).insights;
    const forme = ins.find((i) => i.id === "forme-baisse")!;
    expect(forme.ton).toBe("negatif");
    expect(forme.detail).toMatch(/0 point/);
    expect(ins.find((i) => i.id === "serie-defaites")).toMatchObject({ ton: "negatif" });
    expect(ins.find((i) => i.id === "attaque-baisse")).toBeDefined();
  });

  it("ecart domicile / exterieur", () => {
    const ms = [
      ...[1, 2, 3, 4].map(() => match(2, 0, { domicile: true })),
      ...[1, 2, 3, 4].map(() => match(0, 2, { domicile: false })),
    ];
    const i = calculerTendances(ms).insights.find((x) => x.id === "lieux-ecart")!;
    expect(i.titre).toMatch(/domicile/);
    expect(calculerTendances(ms).insights.map((x) => x.id)).toContain("defense-exterieur");
  });

  it("defense solide et attaque muette, avec taux", () => {
    const ids = titres(scores("1-0", "0-0", "2-0", "0-0", "0-1", "1-0"));
    expect(ids).toEqual(expect.arrayContaining(["profil-solide", "profil-muet"]));
  });

  it("niveau des adversaires : points perdus contre le bas du classement", () => {
    const rangs: Record<string, number> = {};
    const ms = [
      ...[1, 2, 3].map((i) => { rangs[`b${i}`] = 12; return match(0, 1, { adversaireId: `b${i}` }); }),
      ...[1, 2, 3].map((i) => { rangs[`h${i}`] = 1; return match(2, 1, { adversaireId: `h${i}` }); }),
    ];
    const ids = titres(ms, { rangDe: (m: MatchTendance) => rangs[m.adversaireId!] ?? null, nbEquipes: 12 });
    expect(ids).toEqual(expect.arrayContaining(["niveau-bas", "niveau-haut"]));
  });

  it("discipline : expulsions et cartons en fin de match", () => {
    const ms = [1, 2, 3, 4, 5, 6].map(() => match(1, 0, { cartonsJaunes: 1, cartonsRouges: 0, minutesCartons: [85] }));
    ms[0].cartonsRouges = 1; ms[1].cartonsRouges = 1;
    const ids = titres(ms);
    expect(ids).toEqual(expect.arrayContaining(["discipline-rouges", "discipline-fin"]));
  });

  it("trie par importance decroissante", () => {
    const ins = calculerTendances(scores("0-1", "0-2", "0-1", "1-2", "0-1", "3-0", "2-0", "3-0", "2-0", "3-0")).insights;
    for (let i = 1; i < ins.length; i++) expect(ins[i - 1].importance).toBeGreaterThanOrEqual(ins[i].importance);
  });

  it("genererInsights est pur : memes tendances, memes constats", () => {
    const t = calculerTendances(scores("1-0", "1-1", "0-1", "2-0", "1-0", "3-0", "0-0", "1-0"));
    const { insights, ...sans } = t;
    expect(genererInsights(sans)).toEqual(insights);
  });
});
