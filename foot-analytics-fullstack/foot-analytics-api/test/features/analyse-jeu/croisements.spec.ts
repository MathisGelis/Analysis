// Les croisements : correlation, force, danger mesure / reel, joueurs, facteurs, dispositifs.

import { croiser, forceDe, MIN_MATCHS_CORRELATION, pearson } from "@/features/analyse-jeu/croisements";
import { jeuEquipe, MatchJeu } from "@/features/analyse-jeu/jeu-equipe";

const tir = (cote: "dom" | "ext", resultat: string, minute: number, extra: object = {}) => ({ cote, type: "tir", resultat, minute, ...extra }) as any;
/** Un match saisi : `n` tirs dont `b` buts. */
const saisi = (i: number, n: number, b: number, extra: object = {}): MatchJeu => ({
  matchId: `m${i}`, date: `2026-09-${String(i + 1).padStart(2, "0")}`, domicile: true, adversaireId: "adv", formation: null, bp: b, bc: 0, fmi: [],
  evenements: Array.from({ length: n }, (_, k) => tir("dom", k < b ? "but" : "non_cadre", 10 + k, { joueurId: k < b ? "j9" : "j8" })), ...extra,
});

describe("pearson et forceDe", () => {
  it("correlation parfaite, inverse, nulle ; serie constante ou trop courte = null", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });
  it("force : forte, moyenne, faible, nulle", () => {
    expect([0.8, -0.5, 0.2, 0.05].map(forceDe)).toEqual(["forte", "moyenne", "faible", "nulle"]);
  });
});

describe("croiser", () => {
  const mesures = { scoreDanger: 70, fatigueMoy: null, impacts: [] as any[] };
  const noms = new Map<string, string>();

  it("aucun match saisi : rien a croiser, insuffisant", () => {
    const c = croiser(jeuEquipe([{ ...saisi(1, 0, 0), evenements: [] }]), mesures, [], noms);
    expect(c.suffisant).toBe(false);
    expect(c.danger).toBeNull();
    expect(c.facteurs).toEqual([]);
  });

  it("danger mesure contre reel, avec serie et tendance", () => {
    const ms = [saisi(1, 4, 0), saisi(2, 5, 1), saisi(3, 8, 2), saisi(4, 10, 3), saisi(5, 12, 4)];
    const c = croiser(jeuEquipe(ms), mesures, [], noms);
    expect(c.suffisant).toBe(true);
    expect(c.danger!.mesure.scoreDanger).toBe(70);
    expect(c.danger!.reel.matchs).toBe(5);
    expect(c.danger!.reel.tirsParMatch).toBe(7.8);
    expect(c.danger!.serie).toHaveLength(5);
    expect(c.danger!.tendance).toMatchObject({ sens: "hausse" });
    expect(c.danger!.lecture[0]).toContain("score de danger (70/100)");
  });

  it("matchs saisis peu representatifs : l'avertissement apparait", () => {
    const tous = [saisi(1, 6, 0), saisi(2, 6, 0), saisi(3, 6, 0), { ...saisi(4, 0, 4), evenements: [] }, { ...saisi(5, 0, 5), evenements: [] }];
    const c = croiser(jeuEquipe(tous), mesures, [], noms);
    expect(c.danger!.lecture.some((l) => l.startsWith("Attention"))).toBe(true);
  });

  it("facteurs : correlation calculee sous le seuil ou a defaut un message honnete", () => {
    const ms = [saisi(1, 4, 1), saisi(2, 6, 1), saisi(3, 8, 2), saisi(4, 10, 2), saisi(5, 12, 3)];
    const ctx = ms.map((m, i) => ({ matchId: m.matchId, rotation: i + 1, seancesAvant: 2, chargeAvant: 100 + i * 10 }));
    const c = croiser(jeuEquipe(ms), mesures, ctx, noms);
    const rot = c.facteurs.find((f) => f.id === "rotation_tirs")!;
    expect(rot).toMatchObject({ n: 5, force: "forte" });
    expect(rot.r).toBeGreaterThan(0.9);
    expect(rot.lecture).toContain("n'est pas une cause");
    expect(c.facteurs.find((f) => f.id === "seances_tirs")).toMatchObject({ r: null, lecture: expect.stringContaining("Aucune variation") });

    const court = croiser(jeuEquipe(ms), mesures, ctx.slice(0, 3), noms);
    expect(court.facteurs.find((f) => f.id === "rotation_tirs")!.lecture).toContain(`${MIN_MATCHS_CORRELATION} nécessaires`);
  });

  it("joueurs : impact mesure contre production reelle", () => {
    const ms = [saisi(1, 4, 2), saisi(2, 4, 2), saisi(3, 4, 2), saisi(4, 4, 2), saisi(5, 4, 2)];
    const impacts = ["j9", "j8", "a1", "a2", "a3"].map((id, i) => ({ joueurId: id, nom: id.toUpperCase(), matchsAvec: 5, delta: 1, impactPondere: [5, 4, 3, 2, 1][i] }));
    const jeu = jeuEquipe(ms);
    jeu.joueurs.push(...["a1", "a2", "a3"].map((id) => ({ joueurId: id, matchs: 5, buts: 0, passes: 0, tirs: 0, cadres: 0, arrets: 0, jaunes: 0, rouges: 0 })));
    const c = croiser(jeu, { ...mesures, impacts }, [], noms);
    expect(c.joueurs.length).toBe(5);
    expect(c.joueurs[0]).toMatchObject({ joueurId: "j9", buts: 10 });
    expect(c.joueurs.map((j) => j.lecture)).toContain("coherent");
  });

  it("dispositifs : buts, points et echantillon faible", () => {
    const ms = [saisi(1, 5, 2, { formation: "4-4-2", bc: 1 }), saisi(2, 5, 0, { formation: "4-4-2", bc: 0 }), saisi(3, 5, 3, { formation: "4-3-3", bc: 3 })];
    const d = croiser(jeuEquipe(ms), mesures, [], noms).dispositifs;
    expect(d[0]).toMatchObject({ formation: "4-4-2", matchs: 2, butsPourParMatch: 1, pointsParMatch: 2, echantillonFaible: true });
    expect(d.find((x) => x.formation === "4-3-3")).toMatchObject({ matchs: 1, pointsParMatch: 1 });
  });
});
