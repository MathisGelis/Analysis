import { projectionResultat } from "@/features/analyse/projection";
import { ajusterPoisson } from "@/features/ia/ia-maths";
import { construireJeuDonnees } from "@/features/ia/ia-donnees";
import { entrainer, MIN_MATCHS_SCORE_COMPARES, resumeDuResultat } from "@/features/ia/ia-entrainement";
import { HYPER_PAR_DEFAUT, poidsInitiaux } from "@/features/ia/ia-modele";
import { attendusDuModele, caracteristiquesScore, MatchPasse, poidsScoreInitiaux, W_SCORE_DEPART } from "@/features/ia/ia-score";
import { ligue } from "./ligue";

const m = (buts: number, butsContre: number, domicile = true): MatchPasse => ({ buts, butsContre, domicile });
const serie = (n: number, buts: number, contre: number) => Array.from({ length: n }, () => m(buts, contre));

describe("ajusterPoisson", () => {
  it("retrouve le taux d'une loi de Poisson, et reste a l'a priori sans exemple", () => {
    const exemples = Array.from({ length: 400 }, (_, i) => ({ x: [1], y: i % 4 === 0 ? 3 : 1, s: 1 }));   // moyenne 1,5
    const w = ajusterPoisson(exemples, [0], [0], { l2: 0.01, iterations: 20 });
    expect(Math.exp(w[0])).toBeCloseTo(1.5, 1);
    expect(ajusterPoisson([], [0.4], [0], { l2: 1 })).toEqual([0.4]);
  });
});

describe("caracteristiquesScore", () => {
  it("trop peu de matchs d'un cote : rien a predire", () => {
    expect(caracteristiquesScore(serie(2, 1, 1), serie(10, 1, 1), true, 1.3)).toBeNull();
    expect(caracteristiquesScore(serie(10, 1, 1), serie(2, 1, 1), true, 1.3)).toBeNull();
  });

  it("les moyennes sont lissees vers celle de la ligue : un 5-0 isole ne fait pas une attaque de 5 buts", () => {
    const peu = caracteristiquesScore([m(5, 0), m(5, 0), m(5, 0)], serie(10, 1, 1), true, 1.3)!;
    const beaucoup = caracteristiquesScore(serie(10, 5, 0), serie(10, 1, 1), true, 1.3)!;
    expect(Math.exp(peu[2])).toBeLessThan(Math.exp(beaucoup[2]));
    expect(Math.exp(peu[2])).toBeCloseTo((15 + 3 * 1.3) / 6, 6);
    expect(peu[1]).toBe(1);
    expect(caracteristiquesScore(serie(5, 1, 1), serie(5, 1, 1), false, 1.3)![1]).toBe(-1);
    expect(caracteristiquesScore(serie(5, 1, 1), serie(5, 1, 1), null, 1.3)![1]).toBe(0);
  });
});

describe("attendusDuModele", () => {
  it("a l'a priori, ressemble au modele de Poisson sur les moyennes, et un modele ancien (poids absents) continue de marcher", () => {
    const poids = poidsScoreInitiaux();
    const moi = serie(10, 2, 1);
    const adv = serie(10, 1, 2);
    const ia = attendusDuModele(poids, moi, adv, true)!;
    const poisson = projectionResultat({ moi: { matchs: 10, bpm: 2, bcm: 1 }, adv: { matchs: 10, bpm: 1, bcm: 2 }, domicileMoi: true })!;
    expect(Math.abs(ia.moi - poisson.buts.moi)).toBeLessThan(0.5);
    expect(ia.moi).toBeGreaterThan(ia.adv);
    const ancien = { ...poids, noms: poids.noms.slice(0, 4), w: W_SCORE_DEPART.slice(0, 4) };
    expect(attendusDuModele(ancien, moi, adv, true)).not.toBeNull();
    expect(attendusDuModele(poids, serie(2, 1, 1), adv, true)).toBeNull();
  });
});

describe("entrainement du score", () => {
  const jeu = construireJeuDonnees(ligue({ clubs: 8, semaines: 40, scores: true }));

  it("des feuilles portent buts et equipe adverse", () => {
    expect(jeu.feuilles.every((f) => f.buts !== null && f.butsContre !== null && f.adversaireEquipe !== "")).toBe(true);
    const [a, b] = jeu.feuilles.filter((f) => f.matchId === jeu.feuilles[0].matchId);
    expect(a.buts).toBe(b.butsContre);
    expect(a.adversaireEquipe).toBe(b.equipe);
  });

  it("apprend les forces des equipes, compare au modele de Poisson sur les memes matchs et le garde seulement s'il fait aussi bien", async () => {
    const r = await entrainer(jeu, { grille: [HYPER_PAR_DEFAUT] });
    expect(r.score).not.toBeNull();
    const s = r.score!;
    expect(s.n).toBeGreaterThan(MIN_MATCHS_SCORE_COMPARES);
    expect(s.modele.perte!).toBeGreaterThan(0);
    expect(s.retenu).toBe(s.modele.perte! <= s.poisson.perte!);
    expect(r.poids.scoreRetenu).toBe(s.retenu);
    expect(r.poids.score!.w).toHaveLength(6);
    expect(r.poids.score!.moyenneLigue).toBeGreaterThan(0.5);
    expect(resumeDuResultat(r).scoreRetenu).toBe(s.retenu);
    // Les poids appris separent l'attaque et la defense : l'attaque compte positivement.
    expect(r.poids.score!.w[2]).toBeGreaterThan(0);
  });

  it("sans score connu (un seul modele ancien, ou des feuilles sans resultat), pas de comparaison et le modele de Poisson reste", async () => {
    const sans = construireJeuDonnees({ ...ligue({ clubs: 6, semaines: 4, scores: true }), matchs: ligue({ clubs: 6, semaines: 4 }).matchs.map((x) => ({ ...x, scoreDom: null, scoreExt: null })) });
    const r = await entrainer(sans, { grille: [HYPER_PAR_DEFAUT] });
    expect(r.score ?? null).toBeNull();
    expect(r.poids.scoreRetenu).toBe(false);
    expect(poidsInitiaux().scoreRetenu).toBeUndefined();
  });
});
