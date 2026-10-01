import { projectionResultat } from "@/features/analyse/projection";

const equipe = (bpm: number, bcm: number, matchs = 12) => ({ matchs, bpm, bcm });

describe("projectionResultat", () => {
  it("equipes identiques, terrain inconnu : victoire et defaite symetriques, somme 100", () => {
    const p = projectionResultat({ moi: equipe(1.5, 1.5), adv: equipe(1.5, 1.5), domicileMoi: null })!;
    expect(p.pV).toBe(p.pD);
    expect(p.pV + p.pN + p.pD).toBe(100);
    expect(p.buts).toEqual({ moi: 1.5, adv: 1.5 });
    expect(p.matchs).toBe(12);
  });

  it("la meilleure equipe est favorite, et son score probable la place devant", () => {
    const p = projectionResultat({ moi: equipe(2.6, 0.8), adv: equipe(1.0, 2.0), domicileMoi: null })!;
    expect(p.pV).toBeGreaterThan(60);
    expect(p.pV).toBeGreaterThan(p.pN);
    expect(p.pN).toBeGreaterThan(0);
    expect(p.scoreProbable.moi).toBeGreaterThan(p.scoreProbable.adv);
  });

  it("le terrain compte : a domicile mon equipe a plus de chances qu'a l'exterieur", () => {
    const base = { moi: equipe(1.4, 1.4), adv: equipe(1.4, 1.4) };
    const dom = projectionResultat({ ...base, domicileMoi: true })!;
    const ext = projectionResultat({ ...base, domicileMoi: false })!;
    expect(dom.pV).toBeGreaterThan(ext.pV);
    expect(dom.pD).toBeLessThan(ext.pD);
  });

  it("echantillon trop petit d'un cote ou de l'autre : pas de projection", () => {
    expect(projectionResultat({ moi: equipe(2, 1, 4), adv: equipe(2, 1, 12), domicileMoi: true })).toBeNull();
    expect(projectionResultat({ moi: equipe(2, 1, 12), adv: equipe(2, 1, 0), domicileMoi: true })).toBeNull();
    expect(projectionResultat({ moi: equipe(2, 1, 4), adv: equipe(2, 1, 4), domicileMoi: true }, 4)).not.toBeNull();
  });

  it("equipes qui ne marquent jamais : le 0-0 domine, les probabilites restent definies", () => {
    const p = projectionResultat({ moi: equipe(0, 0), adv: equipe(0, 0), domicileMoi: null })!;
    expect(p.scoreProbable).toMatchObject({ moi: 0, adv: 0 });
    expect(p.pV + p.pN + p.pD).toBe(100);
    expect(p.pN).toBeGreaterThan(p.pV);
  });

  it("probabilite du score probable plausible (quelques dizaines de %, jamais plus de la moitie)", () => {
    const p = projectionResultat({ moi: equipe(1.5, 1.2), adv: equipe(1.3, 1.4), domicileMoi: true })!;
    expect(p.scoreProbable.proba).toBeGreaterThan(5);
    expect(p.scoreProbable.proba).toBeLessThan(25);
  });
});
