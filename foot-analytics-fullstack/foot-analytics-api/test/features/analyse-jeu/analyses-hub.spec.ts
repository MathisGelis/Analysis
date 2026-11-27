import { analyserHub, constatsDuHub, fiabiliteDe, MatchHub } from "@/features/analyse-jeu/analyses-hub";

let n = 0;
const ev = (e: object) => ({ cote: "dom" as const, minute: 10, ...e }) as any;
const tir = (cote: "dom" | "ext", resultat: string, minute: number, extra: object = {}) => ev({ cote, type: "tir", resultat, minute, ...extra });
const match = (evenements: any[], extra: Partial<MatchHub> = {}): MatchHub => ({
  matchId: `m${++n}`, date: `${String((n % 27) + 1).padStart(2, "0")}/10/2025`, domicile: true, adversaireId: "adv", formation: null,
  bp: evenements.filter((e) => e.cote === "dom" && e.resultat === "but").length, bc: evenements.filter((e) => e.cote === "ext" && e.resultat === "but").length,
  evenements, fmi: [], gardien: "gk", ...extra,
});

describe("dispositifs affrontes", () => {
  const ms = [
    match([tir("dom", "but", 10, { zoneTier: 0, zoneCouloir: 2 })], { formationAdverse: "4-4-2", formationSaisie: "4-3-3" }),
    match([tir("dom", "but", 10), tir("dom", "but", 40)], { formationAdverse: "4-4-2", formationSaisie: "4-3-3" }),
    match([tir("ext", "but", 20, { zoneTier: 0, zoneCouloir: 1 })], { formationAdverse: "4-4-2", formationSaisie: "4-2-3-1" }),
    match([tir("ext", "but", 20)], { formationAdverse: "3-5-2", formationSaisie: "4-3-3" }),
    match([tir("dom", "but", 20)]),                                                         // dispositif adverse non saisi
  ];
  const d = analyserHub(ms).dispositifs;

  it("couverture, repartition et bilan par dispositif adverse (matchs sans dispositif saisi ecartes)", () => {
    expect(d.couverture).toEqual({ avec: 4, total: 5 });
    expect(d.repartition).toEqual([{ formation: "4-4-2", matchs: 3 }, { formation: "3-5-2", matchs: 1 }]);
    const l = d.lignes.find((x) => x.formation === "4-4-2")!;
    expect(l).toMatchObject({ matchs: 3, v: 2, n: 0, d: 1, ptsParMatch: 2, saisis: 3, tirsPour: 3, tirsContre: 1, fiabilite: "moyenne" });
    expect(l.bpParMatch).toBeCloseTo(1, 2);
    expect(l.conversionAdv).toBe(100);                                    // son seul tir est un but
    expect(l.xgDiffParMatch).toEqual(expect.any(Number));
  });

  it("notre meilleure reponse a un dispositif adverse affronte au moins deux fois", () => {
    expect(d.reponses).toEqual([{ adverse: "4-4-2", nous: "4-3-3", matchs: 2, ptsParMatch: 3 }]);
  });
});

describe("occasions creees et concedees", () => {
  const ms = [
    match([
      tir("dom", "but", 10, { zoneTier: 0, zoneCouloir: 2, contextes: ["Attaque placée"], joueurId: "p9", joueur2Id: "p7" }),
      tir("dom", "cadre", 30, { zoneTier: 0, zoneCouloir: 4, contextes: ["CPA"], joueurId: "p9", joueur2Id: "p7" }),
      tir("dom", "non_cadre", 40, { zoneTier: 1, zoneCouloir: 2 }),
      tir("ext", "but", 50, { zoneTier: 0, zoneCouloir: 0, contextes: ["Contre-attaque"] }),       // leur gauche = notre droite
      tir("ext", "cadre", 60, { zoneTier: 0, zoneCouloir: 1 }),
    ]),
  ];
  const a = analyserHub(ms);

  it("zones de creation : l'attaque en haut, xG par zone, familles et reseau passeur -> tireur", () => {
    expect(a.creation).toMatchObject({ tirs: 3, buts: 1 });
    expect(a.creation.zones.tirs[2]).toBe(1);               // offensif, centre
    expect(a.creation.zones.tirs[4]).toBe(1);               // offensif, droit
    expect(a.creation.zones.tirs[7]).toBe(1);               // median, centre
    expect(a.creation.familles.map((f) => f.famille).sort()).toEqual(["Coup de pied arrêté", "Jeu placé", "Non précisé"]);
    expect(a.creation.reseau).toEqual([expect.objectContaining({ passeurId: "p7", tireurId: "p9", tirs: 2, buts: 1 })]);
    expect(a.creation.qualite.reduce((s, q) => s + q.tirs, 0)).toBe(3);
  });

  it("zones concedees retournees : leur tiers offensif est notre tiers defensif, leur gauche notre droite", () => {
    expect(a.concession.zones.tirs[(2 - 0) * 5 + (4 - 0)]).toBe(1);        // tir de leur gauche, offensif -> notre defense, droite
    expect(a.concession.zones.tirs[(2 - 0) * 5 + (4 - 1)]).toBe(1);
    expect(a.concession.couloirs.find((c) => c.nom === "droite")!.tirs).toBe(2);
    expect(a.concession.gardien).toMatchObject({ tirsCadres: 2, arrets: 1, butsEncaisses: 1 });
  });
});

describe("le jeu selon le score", () => {
  it("minutes et tirs par etat du match, reconstitues des buts dates ; un match dont les buts ne font pas le score est ecarte", () => {
    const m = match([tir("dom", "but", 20), tir("ext", "but", 50), tir("ext", "non_cadre", 70), tir("dom", "non_cadre", 80)]);
    const incoherent = match([tir("dom", "but", 20)], { bp: 3, bc: 0 });
    const s = analyserHub([m, incoherent]).score;
    expect(s.matchs).toBe(1);
    const e = Object.fromEntries(s.etats.map((x) => [x.etat, x]));
    expect(e.egalite.minutes).toBe(20 + 40);                 // 0-0 puis 1-1 : de 0 a 20, de 50 a 90
    expect(e.mene.minutes).toBe(30);                         // 1-0 de 20 a 50
    expect(e.mene_par_adv.minutes).toBe(0);
    expect(e.egalite.tirsContre).toBe(1);                    // le tir de la 70e, a 1-1
    expect(e.egalite.tirsPour).toBe(2);                      // le tir de la 20e (avant son propre but) et le tir de la 80e
  });
});

describe("rythme, profil et dependances", () => {
  it("tirs, xG, buts et cartons par tranche de 15 minutes", () => {
    const a = analyserHub([match([tir("dom", "but", 5), tir("ext", "but", 80), ev({ type: "faute", minute: 20 }), ev({ type: "carton_jaune", minute: 20 }), ev({ cote: "ext", type: "carton_jaune", minute: 88 })])]);
    expect(a.rythme.tirsPour[0]).toBe(1);
    expect(a.rythme.butsContre[5]).toBe(1);
    expect(a.rythme.fautes[1]).toBe(1);
    expect(a.rythme.cartons.pour[1]).toBe(1);
    expect(a.rythme.cartons.contre[5]).toBe(1);
  });

  it("profil : la saison contre les 5 derniers matchs, base 100, sens inverse pour ce qui est mieux quand c'est plus bas", () => {
    const bons = Array.from({ length: 5 }, () => match([tir("dom", "but", 10, { zoneTier: 0, zoneCouloir: 2 }), tir("dom", "but", 30, { zoneTier: 0, zoneCouloir: 2 })], { date: "01/11/2025" }));
    const mauvais = Array.from({ length: 5 }, () => match([tir("ext", "but", 10, { zoneTier: 0, zoneCouloir: 2 })], { date: "01/10/2025" }));
    const p = analyserHub([...mauvais, ...bons]).profil;
    expect(p.recents).toBe(5);
    const bp = p.indicateurs.find((i) => i.cle === "butsPour")!;
    expect(bp.recent).toBeGreaterThan(bp.saison!);
    const axe = (nom: string) => p.radar.find((r) => r.axe === nom)!.recent;
    expect(axe("Création")).toBeGreaterThan(100);
    expect(axe("Solidité")).toBeGreaterThan(100);             // on encaisse moins sur les 5 derniers : meilleur
  });

  it("dependances : seulement a partir de 5 buts", () => {
    expect(analyserHub([match([tir("dom", "but", 5, { joueurId: "p9" })])]).dependances).toBeNull();
    const buts = Array.from({ length: 6 }, (_, i) => tir("dom", "but", 5 + i, { joueurId: i < 4 ? "p9" : "p10", joueur2Id: "p7" }));
    const d = analyserHub([match(buts)]).dependances!;
    expect(d.buteur).toEqual({ joueurId: "p9", buts: 4, part: 67 });
    expect(d.passeur).toEqual({ joueurId: "p7", passes: 6, part: 100 });
  });
});

describe("interpretations", () => {
  it("sans match saisi : aucune lecture ; la fiabilite suit la taille de l'echantillon", () => {
    expect(analyserHub([match([], { bp: 1, bc: 0 })]).constats).toEqual([]);
    expect(fiabiliteDe(2, 3, 8)).toBe("faible");
    expect(fiabiliteDe(5, 3, 8)).toBe("moyenne");
    expect(fiabiliteDe(9, 3, 8)).toBe("bonne");
  });

  it("des occasions qui ne se transforment pas : alerte avec piste ; on ne dit rien sous 15 tirs", () => {
    const rate = (i: number) => tir("dom", "non_cadre", 10 + i, { zoneTier: 0, zoneCouloir: 2 });
    const peu = analyserHub([match(Array.from({ length: 10 }, (_, i) => rate(i)))]);
    expect(peu.constats.find((c) => c.id === "finition_basse")).toBeUndefined();
    const beaucoup = analyserHub([match(Array.from({ length: 20 }, (_, i) => rate(i))), match(Array.from({ length: 20 }, (_, i) => rate(i)))]);
    const c = beaucoup.constats.find((x) => x.id === "finition_basse")!;
    expect(c).toMatchObject({ ton: "alerte", domaine: "creation", fiabilite: "bonne" });
    expect(c.piste).toEqual(expect.any(String));
  });

  it("un couloir concede, les transitions, les dispositifs en difficulte", () => {
    const concedes = Array.from({ length: 16 }, (_, i) => tir("ext", i % 4 === 0 ? "but" : "cadre", 10 + i * 3, { zoneTier: 0, zoneCouloir: 0, contextes: ["Contre-attaque"] }));
    const ms = Array.from({ length: 4 }, () => match(concedes.slice(0, 4), { formationAdverse: "4-4-2" }));
    const ids = analyserHub(ms).constats.map((c) => c.id);
    expect(ids).toContain("concession_couloir");
    expect(ids).toContain("dispositif_difficile");
    expect(constatsDuHub(analyserHub(ms)).length).toBeLessThanOrEqual(10);
  });
});
