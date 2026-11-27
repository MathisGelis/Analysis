import { parcoursDesGardiens } from "@/features/analyse-jeu/arrets";
import { rangsDansEffectif, statsJoueur } from "@/features/analyse-jeu/data-hub";
import { MatchJeu } from "@/features/analyse-jeu/jeu-equipe";
import { presencesDuJoueur } from "@/features/analyse-jeu/minutes-joueur";

let n = 0;
const ev = (e: object) => ({ cote: "dom" as const, minute: 10 + ++n, ...e }) as any;
const tir = (cote: "dom" | "ext", resultat: string, minute: number, extra: object = {}) => ev({ cote, type: "tir", resultat, minute, ...extra });
const match = (evenements: any[], extra: Partial<MatchJeu> = {}): MatchJeu => ({
  matchId: `m${++n}`, date: "01/10/2025", domicile: true, adversaireId: "adv", formation: null, bp: 0, bc: 0, evenements, fmi: [], gardien: "gk1", ...extra,
});

describe("parcours d'un gardien", () => {
  it("tirs cadres subis, arrets, buts encaisses et xG cadre pour chaque gardien, selon qui est dans les buts a la minute du tir", () => {
    const m = match([
      tir("ext", "cadre", 20), tir("ext", "but", 30), tir("ext", "non_cadre", 40),
      ev({ cote: "dom", type: "remplacement", minute: 60, joueurId: "gk1", joueur2Id: "gk2" }),
      tir("ext", "cadre", 70), tir("ext", "but", 80), ev({ cote: "ext", type: "penalty", resultat: "arrete", minute: 85 }),
    ], { bp: 0, bc: 2 });
    const p = parcoursDesGardiens(m);
    expect(p.gk1).toMatchObject({ tirsCadres: 2, arrets: 1, butsEncaisses: 1, penaltysSubis: 0 });
    expect(p.gk2).toMatchObject({ tirsCadres: 3, arrets: 2, butsEncaisses: 1, penaltysSubis: 1, penaltysArretes: 1 });
    expect(p.gk1.xgCadres).toBeGreaterThan(0);
  });
});

describe("stats d'un joueur : minutes, qualite, gardien", () => {
  const m1 = match([
    tir("dom", "but", 10, { joueurId: "p9", joueur2Id: "p7", zoneTier: 0, zoneCouloir: 2, contextes: ["CPA"] }),
    tir("dom", "cadre", 30, { joueurId: "p9", zoneTier: 0, zoneCouloir: 3, contextes: ["Contre-attaque"] }),
    tir("dom", "non_cadre", 50, { joueurId: "p9", zoneTier: 1, zoneCouloir: 2 }),
    ev({ cote: "dom", type: "penalty", resultat: "but", joueurId: "p9", minute: 80 }),
    tir("ext", "cadre", 20), tir("ext", "but", 40),
  ], { bp: 2, bc: 1 });
  const m2 = match([tir("dom", "cadre", 15, { joueurId: "p9" }), tir("ext", "cadre", 25)], { bp: 0, bc: 0 });
  const presences = new Map([[m1.matchId, { minutes: 90, titulaire: true, numero: 9 }], [m2.matchId, { minutes: 45, titulaire: false, numero: 9 }]]);

  it("minutes et titularisations des matchs saisis, tranches de 15 minutes, familles, grosses occasions, buts sur CPA", () => {
    const s = statsJoueur([m1, m2], "p9", presences);
    expect(s.presence).toEqual({ matchs: 2, minutes: 135, titularisations: 1 });
    expect(s.tranches.buts).toEqual([1, 0, 0, 0, 0, 1]);                    // 10e et 80e (penalty)
    expect(s.tranches.tirs[0]).toBe(2);                                      // un tir par match entre la 1re et la 15e minute
    expect(s.butsCpa).toBe(2);                                              // le but sur CPA et le penalty
    expect(s.grosses.total).toBeGreaterThanOrEqual(1);
    expect(s.familles.map((f) => f.famille).sort()).toEqual(["Coup de pied arrêté", "Non précisé", "Transition"]);
    expect(s.parMatch.find((x) => x.matchId === m2.matchId)).toMatchObject({ minutes: 45, titulaire: false, tirs: 1 });
    expect(statsJoueur([m1, m2], "p9").presence).toBeNull();                // sans feuille : pas de minutes inventees
  });

  it("un gardien : buts encaisses quand il est dans les buts, buts evites, clean sheet ; un joueur de champ n'a aucune ligne de gardien", () => {
    const s = statsJoueur([m1, m2], "gk1", new Map([[m1.matchId, { minutes: 90, titulaire: true, numero: 1 }], [m2.matchId, { minutes: 90, titulaire: true, numero: 1 }]]));
    expect(s.gardien).toMatchObject({ matchs: 2, tirsCadres: 3, arrets: 2, butsEncaisses: 1, cleanSheets: 1 });
    expect(s.gardien!.butsEvites).toBeCloseTo(s.gardien!.xgCadres - 1, 2);
    expect(statsJoueur([m1, m2], "p9").gardien).toBeNull();
    expect(s.tirs).toBe(0);
  });
});

describe("rang dans l'effectif", () => {
  const m = match([
    tir("dom", "but", 10, { joueurId: "a", joueur2Id: "c" }), tir("dom", "but", 20, { joueurId: "a", joueur2Id: "c" }), tir("dom", "but", 30, { joueurId: "b", joueur2Id: "c" }),
    tir("dom", "non_cadre", 40, { joueurId: "b" }), tir("dom", "non_cadre", 41, { joueurId: "c" }),
  ], { bp: 3, bc: 0 });

  it("1er buteur, 2e en tirs ; seulement ce que le joueur a fait au moins une fois", () => {
    const a = rangsDansEffectif([m], "a");
    expect(a.find((r) => r.cle === "buts")).toMatchObject({ valeur: 2, rang: 1, sur: 2 });
    expect(a.find((r) => r.cle === "tirs")).toMatchObject({ valeur: 2, rang: 1, sur: 3 });
    expect(a.find((r) => r.cle === "arrets")).toBeUndefined();
    const b = rangsDansEffectif([m], "b");
    expect(b.find((r) => r.cle === "buts")).toMatchObject({ valeur: 1, rang: 2, sur: 2 });
    expect(rangsDansEffectif([m], "c").find((r) => r.cle === "passes")).toMatchObject({ valeur: 3, rang: 1, sur: 1 });
  });
});

describe("presences d'un joueur sur les feuilles", () => {
  const cotes = new Map<string, "dom" | "ext">([["m1", "dom"], ["m2", "ext"]]);
  const lignes = [
    { matchId: "m1", cote: "dom" as const, nom: "DURAND", prenom: "Luc", licence: "L1", titulaire: true, minutes: 90, numero: 9 },
    { matchId: "m1", cote: "ext" as const, nom: "DURAND", prenom: "Luc", licence: "L1", titulaire: true, minutes: 90, numero: 4 },       // un homonyme de l'adversaire
    { matchId: "m2", cote: "ext" as const, nom: "Durand", prenom: "Luc", licence: null, titulaire: false, minutes: 0, numero: 14 },
  ];

  it("une presence par match, du cote de son club ; sans licence, le nom et le prenom ; minutes deduites des remplacements", () => {
    const p = presencesDuJoueur({ licence: "L1", nom: "DURAND", prenom: "Luc" }, lignes, [], cotes);
    expect(p.get("m1")).toEqual({ minutes: 90, titulaire: true, numero: 9 });
    expect(p.has("m2")).toBe(true);                                                           // repere par le nom (la feuille n'a pas de licence)
    const sorti = presencesDuJoueur({ licence: "L1", nom: "DURAND", prenom: "Luc" }, lignes.slice(0, 1).map((l) => ({ ...l, minutes: 0 })),
      [{ matchId: "m1", type: "remplacement", equipe: "dom", joueur: "DURAND Luc", joueur2: "Autre Joueur", minute: 60 }], cotes);
    expect(sorti.get("m1")!.minutes).toBe(60);
    expect(presencesDuJoueur({ licence: "ZZ", nom: "INCONNU", prenom: "X" }, lignes, [], cotes).size).toBe(0);
  });
});
