import { matchsRestants, MatchJoue, predireClassement } from "@/features/classement/classement-predit";

const EQUIPES = ["A", "B", "C", "D"].map((id) => ({ id, clubId: `c${id}`, nom: `Equipe ${id}` }));
const egaux = () => ({ dom: 1.4, ext: 1.1 });
const m = (dom: string, ext: string, butsDom: number, butsExt: number): MatchJoue => ({ dom, ext, butsDom, butsExt });
/** Tous les matchs d'une double confrontation, A gagnant toujours. */
const toutJoue = (): MatchJoue[] => EQUIPES.flatMap((a) => EQUIPES.filter((b) => b.id !== a.id).map((b) => m(a.id, b.id, a.id < b.id ? 2 : 0, a.id < b.id ? 0 : 1)));

describe("matchsRestants : chaque equipe en rencontre chaque autre deux fois", () => {
  it("sans match joue : n x (n - 1) matchs ; un match joue enleve exactement ce couple (recevant, visiteur)", () => {
    expect(matchsRestants(EQUIPES, [])).toHaveLength(12);
    const reste = matchsRestants(EQUIPES, [m("A", "B", 1, 0)]);
    expect(reste).toHaveLength(11);
    expect(reste).not.toContainEqual({ dom: "A", ext: "B" });
    expect(reste).toContainEqual({ dom: "B", ext: "A" });          // le retour reste a jouer
    expect(matchsRestants(EQUIPES, toutJoue())).toEqual([]);
  });
});

describe("predireClassement", () => {
  it("moins de trois equipes : rien a predire", () => {
    expect(predireClassement(EQUIPES.slice(0, 2), [], egaux)).toBeNull();
  });

  it("saison terminee : les matchs joues sont immuables, le classement predit est le classement reel, a 100 %", () => {
    const r = predireClassement(EQUIPES, toutJoue(), egaux, 500)!;
    expect(r.matchsRestants).toBe(0);
    expect(r.equipes.map((e) => e.equipeId)).toEqual(["A", "B", "C", "D"]);
    for (const e of r.equipes) {
      expect(e.ptsAttendus).toBe(e.actuel.pts);
      expect(e.ptsBas).toBe(e.actuel.pts);
      expect(e.ptsHaut).toBe(e.actuel.pts);
      expect(e.rangs[e.actuel.rang - 1]).toBe(1);
    }
  });

  it("les points acquis ne baissent jamais, et les probabilites de rang se recoupent (chaque rang est tenu par une equipe)", () => {
    const joues = [m("A", "B", 3, 0), m("C", "D", 1, 1), m("B", "C", 0, 2)];
    const r = predireClassement(EQUIPES, joues, egaux, 1000)!;
    expect(r.matchsJoues).toBe(3);
    expect(r.matchsRestants).toBe(9);
    for (const e of r.equipes) {
      expect(e.ptsAttendus).toBeGreaterThanOrEqual(e.actuel.pts);
      expect(e.ptsBas).toBeGreaterThanOrEqual(e.actuel.pts);
      expect(e.rangs.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 3);
    }
    for (let rang = 0; rang < 4; rang++) expect(r.equipes.reduce((s, e) => s + e.rangs[rang], 0)).toBeCloseTo(1, 3);
    expect(r.equipes.find((e) => e.equipeId === "A")!.actuel).toMatchObject({ rang: 2, joues: 1, pts: 3, diff: 3 });
  });

  it("une equipe bien plus forte finit devant, une equipe plus faible derriere ; plus de matchs restants = plus d'incertitude", () => {
    const force = (dom: string, ext: string) => ({ dom: (dom === "A" ? 3 : dom === "D" ? 0.4 : 1.2), ext: (ext === "A" ? 3 : ext === "D" ? 0.4 : 1.2) });
    const r = predireClassement(EQUIPES, [], force, 2000)!;
    expect(r.equipes[0].equipeId).toBe("A");
    expect(r.equipes[3].equipeId).toBe("D");
    expect(r.equipes[0].rangs[0]).toBeGreaterThan(0.8);
    const a = r.equipes[0];
    expect(a.ptsHaut).toBeGreaterThan(a.ptsBas);
  });

  it("deterministe : les memes donnees redonnent exactement la meme prediction", () => {
    const joues = [m("A", "B", 1, 0)];
    expect(predireClassement(EQUIPES, joues, egaux, 400)).toEqual(predireClassement(EQUIPES, joues, egaux, 400));
  });

  it("ignore les matchs d'equipes etrangeres au championnat", () => {
    const r = predireClassement(EQUIPES, [m("A", "Z", 5, 0), m("A", "B", 1, 0)], egaux, 200)!;
    expect(r.matchsJoues).toBe(1);
  });
});
