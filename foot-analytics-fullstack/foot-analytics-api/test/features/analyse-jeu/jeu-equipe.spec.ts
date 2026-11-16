// Le jeu d'une equipe sur plusieurs matchs : filtres, couverture, buts par tranche (direct + feuille de match), tirs, zones, familles, discipline.

import { familleDe, filtrerMatchs, jeuEquipe, MatchJeu } from "@/features/analyse-jeu/jeu-equipe";

const tir = (cote: "dom" | "ext", resultat: string, minute: number, extra: object = {}) => ({ cote, type: "tir", resultat, minute, ...extra }) as any;
const match = (id: string, date: string, domicile: boolean, bp: number, bc: number, evenements: any[] = [], fmi: any[] = [], extra: object = {}): MatchJeu =>
  ({ matchId: id, date, domicile, adversaireId: "adv", formation: null, bp, bc, evenements, fmi, ...extra });

describe("filtrerMatchs", () => {
  const ms = [match("a", "2026-09-01", true, 1, 0), match("b", "2026-09-08", false, 0, 0), match("c", "2026-09-15", true, 2, 2), match("d", "2026-09-22", false, 1, 3)];
  it("lieu : domicile, exterieur, tous", () => {
    expect(filtrerMatchs(ms, "domicile", null).map((m) => m.matchId)).toEqual(["a", "c"]);
    expect(filtrerMatchs(ms, "exterieur", null).map((m) => m.matchId)).toEqual(["b", "d"]);
    expect(filtrerMatchs(ms, "tous", null)).toHaveLength(4);
  });
  it("N derniers matchs, dans l'ordre chronologique, apres le lieu", () => {
    expect(filtrerMatchs(ms, "tous", 2).map((m) => m.matchId)).toEqual(["c", "d"]);
    expect(filtrerMatchs(ms, "domicile", 1).map((m) => m.matchId)).toEqual(["c"]);
    expect(filtrerMatchs([...ms].reverse(), "tous", 3).map((m) => m.matchId)).toEqual(["b", "c", "d"]);
  });
  it("dates au format jj/mm/aaaa : triees par date, pas par texte", () => {
    const x = [match("m1", "18/01/2026", true, 0, 0), match("m2", "05/02/2026", true, 0, 0), match("m3", "02/12/2025", true, 0, 0)];
    expect(filtrerMatchs(x, "tous", null).map((m) => m.matchId)).toEqual(["m3", "m1", "m2"]);
  });
});

describe("familleDe", () => {
  it("jeu place, transition, coup de pied arrete, autre ; accents ignores", () => {
    expect(familleDe("Attaque placée")).toBe("Jeu placé");
    expect(familleDe("Attaque placee")).toBe("Jeu placé");
    expect(familleDe("Attaque rapide")).toBe("Transition");
    expect(familleDe("Récup haute")).toBe("Transition");
    expect(familleDe("CPA")).toBe("Coup de pied arrêté");
    expect(familleDe("Centre")).toBe("Autre");
  });
});

describe("jeuEquipe", () => {
  const saisi1 = match("s1", "2026-09-01", true, 2, 1, [
    tir("dom", "but", 12, { zoneTier: 0, zoneCouloir: 3, contextes: ["Attaque placée"], joueurId: "j9", joueur2Id: "j10" }),
    tir("dom", "cadre", 30, { zoneTier: 0, zoneCouloir: 3, contextes: ["Attaque rapide"], joueurId: "j9" }),
    tir("dom", "but", 77, { zoneTier: 1, zoneCouloir: 2, contextes: ["CPA"], joueurId: "j7" }),
    tir("ext", "but", 40, { zoneTier: 0, zoneCouloir: 1 }),
    { cote: "dom", type: "corner", minute: 5 }, { cote: "ext", type: "corner", minute: 6 }, { cote: "ext", type: "faute", minute: 8 },
    { cote: "dom", type: "carton_jaune", minute: 50, joueurId: "j4" },
  ]);
  const saisi2 = match("s2", "2026-09-08", false, 0, 1, [tir("dom", "but", 20), tir("ext", "non_cadre", 25, { zoneTier: 0, zoneCouloir: 0 })]);
  const fmiSeul = match("f1", "2026-09-15", true, 1, 0, [], [{ type: "but", minute: 88, equipe: "dom" }, { type: "carton", sousType: "rouge", minute: 70, equipe: "ext" }]);
  const sansRien = match("n1", "2026-09-22", true, 3, 0);
  const jeu = jeuEquipe([saisi1, saisi2, fmiSeul, sansRien]);

  it("couverture : saisis, buts dates, matchs avec cartons", () => {
    expect(jeu.couverture).toEqual({ matchs: 4, saisis: 2, butsDates: 3, avecCartons: 3 });
  });

  it("buts par tranche : direct et feuille de match melanges, matchs sans minute exclus", () => {
    expect(jeu.buts.matchsCouverts).toBe(3);
    expect(jeu.buts.pour).toEqual([1, 0, 0, 0, 0, 2]);       // 12 (s1), 77 (s1) et 88 (f1) : les deux derniers dans la tranche 75-90
    expect(jeu.buts.contre).toEqual([0, 1, 1, 0, 0, 0]);     // 20 (s2, ou « dom » est l'adversaire), 40 (s1)
    expect(jeu.buts.total).toEqual({ pour: 3, contre: 2 });
  });

  it("tirs : seulement les matchs saisis, conversion et cadrage", () => {
    expect(jeu.tirs!.matchs).toBe(2);
    expect(jeu.tirs!.pour.tirs).toBe(4);
    expect(jeu.tirs!.contre.tirs).toBe(2);
    expect(jeu.tirs!.pour.buts).toBe(2);
    expect(jeu.tirs!.parMatch.pour).toBe(2);
    expect(jeu.tirs!.conversion.pour).toBe(50);
  });

  it("carte des tirs pour et contre, zones de l'equipe qui joue", () => {
    expect(jeu.tirs!.carte.pour.tirs[3]).toBe(2);
    expect(jeu.tirs!.carte.pour.buts[3]).toBe(1);
    expect(jeu.tirs!.carte.contre.tirs[1]).toBe(1);
  });

  it("contextes regroupes par famille", () => {
    const fam = Object.fromEntries(jeu.tirs!.familles.map((f) => [f.famille, f]));
    expect(fam["Jeu placé"]).toMatchObject({ tirs: 1, buts: 1 });
    expect(fam["Transition"]).toMatchObject({ tirs: 1, buts: 0 });
    expect(fam["Coup de pied arrêté"]).toMatchObject({ tirs: 1, buts: 1 });
  });

  it("discipline : details sur les matchs saisis, cartons sur tous les matchs qui en ont", () => {
    const d = jeu.discipline!;
    expect(d.matchsSaisis).toBe(2);
    expect(d.corners).toEqual({ pour: 1, contre: 1 });
    expect(d.fautes).toEqual({ pour: 0, contre: 1 });
    expect(d.jaunes).toEqual({ pour: 1, contre: 0 });
    expect(d.rouges).toEqual({ pour: 0, contre: 1 });          // le rouge vient de la feuille de match
  });

  it("joueurs : buts, passes, tirs, matchs", () => {
    const j9 = jeu.joueurs.find((j) => j.joueurId === "j9")!;
    expect(j9).toMatchObject({ buts: 1, tirs: 2, cadres: 2, matchs: 1 });
    expect(jeu.joueurs.find((j) => j.joueurId === "j10")).toMatchObject({ passes: 1 });
    expect(jeu.joueurs.find((j) => j.joueurId === "j4")).toMatchObject({ jaunes: 1 });
    expect(jeu.joueurs[0].joueurId).toBe("j9");
  });

  it("aucun match saisi : pas de bloc tirs, cartons de la feuille quand elle en a", () => {
    const j = jeuEquipe([fmiSeul]);
    expect(j.tirs).toBeNull();
    expect(j.discipline).toMatchObject({ matchsSaisis: 0, rouges: { pour: 0, contre: 1 } });
    expect(jeuEquipe([sansRien]).discipline).toBeNull();
    expect(jeuEquipe([]).couverture).toEqual({ matchs: 0, saisis: 0, butsDates: 0, avecCartons: 0 });
  });
});
