// Le resume d'un match : stats, buts par tranche, carte des tirs, constats, et la repartition direct / feuille de match.

import { nomZone, resumerMatch, trancheDe } from "@/features/analyse-jeu/stats-jeu";

const ev = (e: object) => ({ cote: "dom" as const, minute: 10, ...e }) as any;
const tir = (cote: "dom" | "ext", resultat: string, minute: number, extra: object = {}) => ev({ cote, type: "tir", resultat, minute, ...extra });
const base = { nousCote: "dom" as const, fmi: [], scoreDom: 0, scoreExt: 0 };

describe("stats-jeu : tranches et zones", () => {
  it("tranches de 15 minutes, la derniere absorbe les arrets de jeu", () => {
    expect([1, 15, 16, 30, 31, 45, 46, 75, 76, 90, 95].map(trancheDe)).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 5, 5, 5]);
  });
  it("nom d'une zone : tiers puis couloir", () => {
    expect(nomZone(3)).toBe("Offensif · axe droit");
    expect(nomZone(14)).toBe("Défensif · droit");
  });
});

describe("resumerMatch : avec le direct", () => {
  const evenements = [
    tir("dom", "but", 12, { zoneTier: 0, zoneCouloir: 3, contextes: ["Attaque placée"] }),
    tir("dom", "cadre", 20, { zoneTier: 0, zoneCouloir: 3 }),
    tir("dom", "non_cadre", 33, { zoneTier: 0, zoneCouloir: 2 }),
    tir("dom", "contre", 40, { zoneTier: 1, zoneCouloir: 1 }),
    tir("dom", "but", 77, { zoneTier: 0, zoneCouloir: 3, contextes: ["CPA"] }),
    tir("dom", "non_cadre", 80),
    tir("ext", "but", 22, { zoneTier: 0, zoneCouloir: 1 }),
    ev({ cote: "dom", type: "corner", minute: 5 }), ev({ cote: "dom", type: "corner", minute: 50 }), ev({ cote: "ext", type: "corner", minute: 55 }),
    ev({ cote: "dom", type: "arret", minute: 60 }),
    ev({ cote: "dom", type: "carton_jaune", minute: 61 }),
  ];
  const r = resumerMatch({ ...base, evenements, scoreDom: 2, scoreExt: 1 });

  it("stats des deux equipes", () => {
    const stat = (cle: string) => r.stats.find((s) => s.cle === cle);
    expect(stat("tirs")).toMatchObject({ nous: 6, eux: 1 });
    expect(stat("cadres")).toMatchObject({ nous: 3, eux: 1 });
    expect(stat("corners")).toMatchObject({ nous: 2, eux: 1 });
    expect(stat("jaunes")).toMatchObject({ nous: 1, eux: 0 });
    expect(r.conversion).toEqual({ nous: 33, eux: 100 });
    expect(r.sources).toEqual({ detail: true, fmi: false });
  });

  it("buts par tranche (direct)", () => {
    expect(r.butsSource).toBe("direct");
    expect(r.tranches.map((t) => [t.nous, t.eux])).toEqual([[1, 0], [0, 1], [0, 0], [0, 0], [0, 0], [1, 0]]);
  });

  it("carte des tirs de MON equipe seulement, avec les buts", () => {
    expect(r.carte.tirs[3]).toBe(3);
    expect(r.carte.buts[3]).toBe(2);
    expect(r.carte.tirs[2]).toBe(1);
    expect(r.carte.tirs[5 + 1]).toBe(1);                    // tiers median, couloir axe gauche
    expect(r.carte.tirs.reduce((s, x) => s + x, 0)).toBe(5); // le tir sans zone n'est pas place sur la carte
  });

  it("contextes des tirs", () => {
    expect(r.contextes).toEqual(expect.arrayContaining([{ nom: "Attaque placée", tirs: 1, buts: 1 }, { nom: "CPA", tirs: 1, buts: 1 }]));
  });

  it("constats : dominateur, premier but, fin de match, coup de pied arrete ; 5 au plus, alertes d'abord", () => {
    const ids = r.constats.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["domination", "premier_but", "cpa"]));
    expect(r.constats.length).toBeLessThanOrEqual(5);
    expect(r.constats.find((c) => c.id === "premier_but")!.detail).toContain("12e");
  });

  it("l'adversaire peut ouvrir le score : constat en alerte", () => {
    const x = resumerMatch({ ...base, evenements: [tir("ext", "but", 8), tir("dom", "non_cadre", 20)], scoreDom: 0, scoreExt: 1 });
    expect(x.constats.find((c) => c.id === "premier_but")).toMatchObject({ ton: "alerte", titre: expect.stringContaining("adversaire") });
  });

  it("score officiel different du direct : l'ecart est signale en tete ; sans score officiel, rien", () => {
    const evs = [tir("dom", "but", 10), tir("dom", "but", 20)];
    const officiel = resumerMatch({ ...base, evenements: evs, scoreDom: 1, scoreExt: 0, scoreOfficiel: true });
    expect(officiel.constats[0]).toMatchObject({ id: "ecart_fmi", ton: "alerte", detail: expect.stringContaining("1-0") });
    expect(resumerMatch({ ...base, evenements: evs, scoreDom: 0, scoreExt: 0 }).constats.map((c) => c.id)).not.toContain("ecart_fmi");
    expect(resumerMatch({ ...base, evenements: evs, scoreDom: 2, scoreExt: 0, scoreOfficiel: true }).constats.map((c) => c.id)).not.toContain("ecart_fmi");
  });

  it("zero but malgre les tirs : constat d'efficacite", () => {
    const x = resumerMatch({ ...base, evenements: Array.from({ length: 8 }, (_, i) => tir("dom", i < 3 ? "cadre" : "non_cadre", 10 + i)), scoreDom: 0, scoreExt: 0 });
    expect(x.constats.map((c) => c.id)).toContain("efficacite");
  });

  it("cote exterieur : « nous » est l'equipe visiteuse", () => {
    const x = resumerMatch({ nousCote: "ext", evenements: [tir("ext", "but", 5), tir("dom", "non_cadre", 6)], fmi: [], scoreDom: 0, scoreExt: 1 });
    expect(x.score).toEqual({ nous: 1, eux: 0 });
    expect(x.stats.find((s) => s.cle === "tirs")).toMatchObject({ nous: 1, eux: 1 });
  });
});

describe("resumerMatch : sans le direct (feuille de match seule)", () => {
  const fmi = [
    { type: "but", minute: 12, equipe: "dom" }, { type: "but", minute: 80, equipe: "ext" },
    { type: "carton", sousType: "jaune", minute: 30, equipe: "dom" }, { type: "carton", sousType: "rouge", minute: 70, equipe: "ext" },
  ] as any;
  const r = resumerMatch({ nousCote: "dom", evenements: [], fmi, scoreDom: 1, scoreExt: 1 });

  it("buts et cartons viennent de la feuille de match, pas de tirs ni de zones", () => {
    expect(r.sources).toEqual({ detail: false, fmi: true });
    expect(r.butsSource).toBe("fmi");
    expect(r.tranches[0].nous).toBe(1);
    expect(r.tranches[5].eux).toBe(1);
    expect(r.stats.map((s) => s.cle)).toEqual(["jaunes", "rouges"]);
    expect(r.stats[0]).toMatchObject({ nous: 1, eux: 0 });
    expect(r.stats[1]).toMatchObject({ nous: 0, eux: 1 });
    expect(r.carte.tirs.every((x) => x === 0)).toBe(true);
  });

  it("annonce que le resume est limite", () => {
    expect(r.constats[0]).toMatchObject({ id: "limite", ton: "neutre" });
  });

  it("rien du tout : score seul, aucune stat inventee", () => {
    const vide = resumerMatch({ ...base, evenements: [], scoreDom: 2, scoreExt: 0 });
    expect(vide.stats).toEqual([]);
    expect(vide.butsSource).toBe("aucune");
    expect(vide.score).toEqual({ nous: 2, eux: 0 });
  });
});

describe("resumerMatch : score et cartons", () => {
  it("match pas encore officiel : le score est celui du direct, du bon cote", () => {
    const evs = [tir("ext", "but", 10), tir("ext", "but", 30), tir("dom", "but", 50)];
    expect(resumerMatch({ ...base, nousCote: "ext", evenements: evs, scoreDom: 0, scoreExt: 0 }).score).toEqual({ nous: 2, eux: 1 });
    expect(resumerMatch({ ...base, nousCote: "dom", evenements: evs, scoreDom: 0, scoreExt: 0 }).score).toEqual({ nous: 1, eux: 2 });
  });
  it("match officiel : la feuille fait foi", () => {
    const evs = [tir("ext", "but", 10)];
    expect(resumerMatch({ ...base, nousCote: "ext", evenements: evs, scoreDom: 2, scoreExt: 1, scoreOfficiel: true }).score).toEqual({ nous: 1, eux: 2 });
  });
  it("direct sans carton saisi : les cartons de la feuille de match, du bon cote", () => {
    const fmi = [{ type: "carton", sousType: "jaune", minute: 20, equipe: "ext" as const }, { type: "carton", sousType: "rouge", minute: 80, equipe: "dom" as const }];
    const r = resumerMatch({ ...base, nousCote: "ext", evenements: [tir("ext", "cadre", 10)], fmi, scoreDom: 0, scoreExt: 0 });
    expect(r.stats.find((x) => x.cle === "jaunes")).toMatchObject({ nous: 1, eux: 0 });
    expect(r.stats.find((x) => x.cle === "rouges")).toMatchObject({ nous: 0, eux: 1 });
  });
});
