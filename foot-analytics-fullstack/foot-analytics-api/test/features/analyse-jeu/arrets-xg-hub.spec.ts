import { arretsDuMatch } from "@/features/analyse-jeu/arrets";
import { dataHub, statsJoueur } from "@/features/analyse-jeu/data-hub";
import { MatchJeu } from "@/features/analyse-jeu/jeu-equipe";
import { resumerMatch } from "@/features/analyse-jeu/stats-jeu";
import { xgDuTir, xgTotal, XG_PENALTY } from "@/features/analyse-jeu/xg";

let n = 0;
const ev = (e: object) => ({ cote: "dom" as const, minute: 10 + ++n, ...e }) as any;
const tir = (cote: "dom" | "ext", resultat: string, extra: object = {}) => ev({ cote, type: "tir", resultat, ...extra });
const match = (evenements: any[], extra: Partial<MatchJeu> = {}): MatchJeu => ({
  matchId: `m${++n}`, date: `0${(n % 9) + 1}/10/2025`, domicile: true, adversaireId: "adv", formation: null, bp: 1, bc: 0, evenements, fmi: [], gardien: "gk1", ...extra,
});

describe("arrets du gardien attribues", () => {
  it("les tirs adverses arretes vont au gardien de depart, puis a son remplacant des qu'il sort", () => {
    const m = match([
      tir("ext", "cadre", { minute: 20 }), tir("ext", "cadre", { minute: 30 }), tir("ext", "but", { minute: 35 }),
      ev({ cote: "dom", type: "remplacement", minute: 60, joueurId: "gk1", joueur2Id: "gk2" }),
      tir("ext", "arrete", { minute: 70 }), ev({ cote: "ext", type: "penalty", resultat: "arrete", minute: 80 }),
    ]);
    expect(arretsDuMatch(m)).toEqual({ total: 4, parGardien: { gk1: 2, gk2: 2 } });
  });

  it("sans gardien connu l'arret compte pour l'equipe, pas pour un joueur ; des arrets saisis avec le gardien gardent leur attribution", () => {
    expect(arretsDuMatch(match([tir("ext", "cadre")], { gardien: null }))).toEqual({ total: 1, parGardien: {} });
    const saisi = match([ev({ cote: "dom", type: "arret", joueurId: "gk1" }), ev({ cote: "dom", type: "arret", joueurId: "gk1" }), tir("ext", "cadre")]);
    expect(arretsDuMatch(saisi)).toEqual({ total: 2, parGardien: { gk1: 2 } });
  });
});

describe("xG estime", () => {
  it("une grosse occasion vaut plus qu'une frappe de loin, un penalty est a part, un tir bloque vaut moins", () => {
    const surLeBut = xgDuTir({ type: "tir", zoneTier: 0, zoneCouloir: 2 });
    const deLoin = xgDuTir({ type: "tir", zoneTier: 1, zoneCouloir: 2, contextes: ["Frappe de loin"] });
    expect(surLeBut).toBeGreaterThan(deLoin * 3);
    expect(xgDuTir({ type: "penalty" })).toBe(XG_PENALTY);
    expect(xgDuTir({ type: "tir", zoneTier: 0, zoneCouloir: 2, resultat: "contre" })).toBeCloseTo(surLeBut / 2, 3);
    expect(xgDuTir({ type: "tir", zoneTier: 0, zoneCouloir: 2, contextes: ["1 contre 1"] })).toBeGreaterThan(surLeBut);
    expect(xgDuTir({ type: "corner" })).toBe(0);
    expect(xgDuTir({ type: "tir" })).toBeGreaterThan(0);                       // zone non saisie : valeur moyenne
    expect(xgDuTir({ type: "tir", zoneTier: 0, zoneCouloir: 2, contextes: Array(10).fill("1 contre 1") })).toBeLessThanOrEqual(0.95);
    expect(xgTotal([{ type: "penalty" }, { type: "tir", zoneTier: 0, zoneCouloir: 2 }])).toBeCloseTo(XG_PENALTY + surLeBut, 2);
  });
});

describe("resume du match : penalty dans les stats finales, carte detaillee, cage", () => {
  const evenements = [
    tir("dom", "but", { minute: 12, zoneTier: 0, zoneCouloir: 2, zoneCadre: 1 }),
    tir("dom", "cadre", { minute: 20, zoneTier: 0, zoneCouloir: 3, zoneCadre: 5 }),
    tir("dom", "non_cadre", { minute: 33, zoneTier: 1, zoneCouloir: 1 }),
    ev({ cote: "dom", type: "penalty", resultat: "but", minute: 50, zoneCadre: 0 }),
    ev({ cote: "ext", type: "penalty", resultat: "arrete", minute: 70 }),
    tir("ext", "cadre", { minute: 80, zoneTier: 0, zoneCouloir: 1 }),
  ];
  const r = resumerMatch({ nousCote: "dom", evenements, fmi: [], scoreDom: 2, scoreExt: 0 });
  const stat = (cle: string) => r.stats.find((s) => s.cle === cle)!;

  it("le penalty compte dans les tirs, les tirs cadres, les penaltys et le score ; l'arret de penalty est un arret", () => {
    expect(stat("penaltys")).toMatchObject({ nous: 1, eux: 1 });
    expect(stat("tirs")).toMatchObject({ nous: 4, eux: 2 });
    expect(stat("cadres")).toMatchObject({ nous: 3, eux: 2 });
    expect(stat("arrets")).toMatchObject({ nous: 2, eux: 1 });                 // nous : le penalty et le tir cadre adverses arretes ; eux : notre tir cadre
  });

  it("chaque tir est detaille (resultat, zone, cadre, xG), les nôtres et ceux de l'adversaire", () => {
    expect(r.tirsDetail.nous).toHaveLength(4);
    expect(r.tirsDetail.eux).toHaveLength(2);
    expect(r.tirsDetail.nous.find((t) => t.type === "penalty")).toMatchObject({ resultat: "but", cadre: 0, xg: XG_PENALTY });
    expect(r.tirsDetail.nous[0]).toMatchObject({ resultat: "but", tier: 0, couloir: 2, cadre: 1 });
    expect(r.tirsDetail.nous.every((t) => t.xg > 0)).toBe(true);
  });
});

describe("stats d'un joueur et data hub", () => {
  const m1 = match([
    tir("dom", "but", { joueurId: "p9", joueur2Id: "p7", zoneTier: 0, zoneCouloir: 2, zoneCadre: 1, minute: 10 }),
    tir("dom", "cadre", { joueurId: "p9", joueur2Id: "p7", zoneTier: 0, zoneCouloir: 3, minute: 20 }),
    tir("dom", "non_cadre", { joueurId: "p10", zoneTier: 1, zoneCouloir: 2, minute: 30 }),
    ev({ cote: "dom", type: "penalty", resultat: "but", joueurId: "p9", minute: 40 }),
    ev({ cote: "dom", type: "corner", joueurId: "p7", minute: 41 }), ev({ cote: "dom", type: "faute", joueurId: "p4", minute: 42 }),
    ev({ cote: "dom", type: "carton_jaune", joueurId: "p4", minute: 43 }),
    ev({ cote: "dom", type: "remplacement", joueurId: "p9", joueur2Id: "p11", minute: 70 }),
    tir("ext", "cadre", { minute: 50 }), tir("ext", "but", { minute: 60 }), ev({ cote: "ext", type: "faute", minute: 61 }),
  ], { bp: 2, bc: 1 });
  const m2 = match([tir("dom", "non_cadre", { joueurId: "p9", minute: 15 }), tir("ext", "non_cadre", { minute: 25 })], { bp: 0, bc: 0, gardien: "gk1" });

  it("toutes les stats attribuees a un joueur atterrissent dans son profil", () => {
    const s = statsJoueur([m1, m2], "p9");
    expect(s).toMatchObject({ matchs: 2, tirs: 4, cadres: 3, buts: 2, sorties: 1, penaltys: { tires: 1, marques: 1 } });
    expect(s.tirsDetail).toHaveLength(4);
    expect(s.parMatch).toHaveLength(2);
    expect(statsJoueur([m1, m2], "p7")).toMatchObject({ passes: 1, passesCles: 1, corners: 1 });     // un but et un tir cadre non marque : une passe decisive, une passe cle
    expect(statsJoueur([m1, m2], "p4")).toMatchObject({ fautes: 1, jaunes: 1, tirs: 0 });
    expect(statsJoueur([m1, m2], "p11")).toMatchObject({ entrees: 1, matchs: 1 });
    expect(statsJoueur([m1, m2], "gk1")).toMatchObject({ arrets: 1, matchs: 1 });                      // le tir adverse cadre de m1 (le gardien de depart)
    expect(statsJoueur([m1, m2], "inconnu")).toMatchObject({ matchs: 0, tirs: 0 });
  });

  it("le data hub : resultats, attaque avec xG, defense avec arrets, coups de pied arretes, discipline", () => {
    const h = dataHub([m1, m2]);
    expect(h.couverture).toEqual({ matchs: 2, saisis: 2 });
    expect(h.resultats).toMatchObject({ joues: 2, v: 1, n: 1, d: 0, pts: 4, bp: 2, bc: 1, diff: 1, cleanSheets: 1, sansMarquer: 1 });
    expect(h.attaque!.tirs).toEqual({ pour: 5, contre: 3 });
    expect(h.attaque!.buts.pour).toBe(2);
    expect(h.attaque!.xg.pour).toBeGreaterThan(0.76);
    expect(h.attaque!.butsMoinsXg).toBeCloseTo(2 - h.attaque!.xg.pour, 2);
    expect(h.defense).toMatchObject({ arrets: 1, cadresConcedes: 2, butsEncaisses: 1 });
    expect(h.coupsDePiedArretes!.corners).toEqual({ pour: 1, contre: 0 });
    expect(h.coupsDePiedArretes!.penaltysTires).toEqual({ tires: 1, marques: 1 });
    expect(h.discipline).toMatchObject({ fautes: { pour: 1, contre: 1 }, jaunes: { pour: 1, contre: 0 } });
    expect(h.tirs.pour).toHaveLength(5);
    expect(h.joueurs.find((j) => j.joueurId === "p9")).toMatchObject({ buts: 2, tirs: 4 });
    expect(h.parMatch).toHaveLength(2);
  });

  it("sans match saisi : les resultats seulement, jamais de stats inventees", () => {
    const h = dataHub([match([], { bp: 2, bc: 2 })]);
    expect(h.resultats).toMatchObject({ joues: 1, n: 1 });
    expect(h.attaque).toBeNull();
    expect(h.defense).toBeNull();
    expect(h.couverture.saisis).toBe(0);
  });
});
