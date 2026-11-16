import { compteurs, estBut, scoreDirect } from "@/features/direct/stats-direct";

const ev = (cote: "dom" | "ext", type: string, resultat?: string) => ({ cote, type, resultat });

describe("score et compteurs du direct", () => {
  it("le score vient des tirs, coups francs et penaltys convertis ; jamais d'un tir arrete ou d'une faute", () => {
    const evs = [ev("dom", "tir", "but"), ev("dom", "tir", "cadre"), ev("ext", "penalty", "but"), ev("ext", "penalty", "arrete"),
      ev("dom", "coup_franc", "but"), ev("ext", "faute"), ev("dom", "corner"), ev("dom", "carton_jaune")];
    expect(scoreDirect(evs)).toEqual({ dom: 2, ext: 1 });
    expect(estBut(ev("dom", "arret", "but"))).toBe(false);
  });

  it("compte tirs, tirs cadres, corners, fautes, hors-jeux, arrets et cartons par equipe", () => {
    const c = compteurs([
      ev("dom", "tir", "but"), ev("dom", "tir", "cadre"), ev("dom", "tir", "non_cadre"), ev("dom", "tir", "contre"), ev("dom", "tir", "poteau"),
      ev("dom", "corner"), ev("dom", "corner"), ev("dom", "coup_franc"), ev("dom", "coup_franc", "cadre"),
      ev("ext", "penalty", "arrete"), ev("ext", "faute"), ev("ext", "faute"), ev("ext", "hors_jeu"), ev("ext", "arret"),
      ev("ext", "carton_jaune"), ev("ext", "carton_rouge"),
    ]);
    expect(c.dom).toMatchObject({ tirs: 6, tirsCadres: 3, buts: 1, corners: 2, coupsFrancs: 2 });
    expect(c.ext).toMatchObject({ tirs: 1, tirsCadres: 1, penaltys: 1, fautes: 2, horsJeux: 1, arrets: 1, jaunes: 1, rouges: 1 });
  });
});
