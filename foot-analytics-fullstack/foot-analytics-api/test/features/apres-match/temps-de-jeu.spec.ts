// Temps de jeu et faits de chaque joueur, tires des evenements du direct.

import { fichesDuMatch } from "@/features/apres-match/temps-de-jeu";

const joueurs = [
  { id: "g", role: "titulaire" }, { id: "a", role: "titulaire" }, { id: "b", role: "titulaire" },
  { id: "r1", role: "remplacant" }, { id: "r2", role: "remplacant" }, { id: "x", role: "groupe" },
];
const ev = (e: object) => ({ cote: "dom" as const, minute: 10, ...e }) as any;

describe("fichesDuMatch", () => {
  it("un titulaire joue tout le match, un joueur du groupe n'a pas joue", () => {
    const f = fichesDuMatch(joueurs, [], "dom", 90);
    expect(f.get("g")).toMatchObject({ minutes: 90, aJoue: true });
    expect(f.get("r1")).toMatchObject({ minutes: 0, aJoue: false });
    expect(f.get("x")).toMatchObject({ minutes: 0, aJoue: false });
  });

  it("remplacement : le sortant s'arrete, l'entrant joue le reste", () => {
    const f = fichesDuMatch(joueurs, [ev({ type: "remplacement", minute: 60, joueurId: "a", joueur2Id: "r1" })], "dom", 90);
    expect(f.get("a")!.minutes).toBe(60);
    expect(f.get("r1")).toMatchObject({ minutes: 30, aJoue: true });
  });

  it("un entrant peut ressortir ; un carton rouge arrete le joueur", () => {
    const f = fichesDuMatch(joueurs, [
      ev({ type: "remplacement", minute: 50, joueurId: "a", joueur2Id: "r1" }),
      ev({ type: "remplacement", minute: 70, joueurId: "r1", joueur2Id: "r2" }),
      ev({ type: "carton_rouge", minute: 80, joueurId: "b" }),
    ], "dom", 90);
    expect(f.get("r1")!.minutes).toBe(20);
    expect(f.get("r2")!.minutes).toBe(20);
    expect(f.get("b")).toMatchObject({ minutes: 80 });
    expect(f.get("b")!.faits.rouges).toBe(1);
  });

  it("buts, passes, tirs, arrets et cartons ; les evenements adverses sont ignores", () => {
    const f = fichesDuMatch(joueurs, [
      ev({ type: "tir", resultat: "but", joueurId: "a", joueur2Id: "b" }),
      ev({ type: "tir", resultat: "cadre", joueurId: "a" }),
      ev({ type: "arret", joueurId: "g" }),
      ev({ type: "carton_jaune", joueurId: "b" }),
      ev({ cote: "ext", type: "tir", resultat: "but", joueurId: "a" }),
    ], "dom", 90);
    expect(f.get("a")!.faits).toMatchObject({ buts: 1, tirs: 1 });
    expect(f.get("b")!.faits).toMatchObject({ passes: 1, jaunes: 1 });
    expect(f.get("g")!.faits.arrets).toBe(1);
  });

  it("sans plan de jeu : celui qui agit ou qui sort a joue depuis le debut, les autres non", () => {
    const sansPlan = joueurs.map((j) => ({ ...j, role: "groupe" }));
    const f = fichesDuMatch(sansPlan, [
      ev({ type: "tir", resultat: "but", minute: 12, joueurId: "a" }),
      ev({ type: "remplacement", minute: 40, joueurId: "b", joueur2Id: "r1" }),
    ], "dom", 90);
    expect(f.get("a")).toMatchObject({ aJoue: true, minutes: 90 });
    expect(f.get("b")!.minutes).toBe(40);
    expect(f.get("r1")!.minutes).toBe(50);
    expect(f.get("g")).toMatchObject({ aJoue: false, minutes: 0 });
  });

  it("jamais de minutes negatives ni au-dela de la fin du match", () => {
    const f = fichesDuMatch(joueurs, [ev({ type: "remplacement", minute: 95, joueurId: "a", joueur2Id: "r1" })], "dom", 90);
    expect(f.get("a")!.minutes).toBe(90);
    expect(f.get("r1")!.minutes).toBe(0);
  });
});
