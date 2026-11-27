import { fusionnerPresences, presencesDuDirect } from "@/features/analyse-jeu/minutes-joueur";

const onze = ["g", "a", "b", "c", "d", "e", "f", "h", "i", "j", "k"];
const plan = { matchId: "m1", titulaires: onze, remplacants: ["x", "y"], numeros: { a: 2, x: 14 } };
const cotes = new Map<string, "dom" | "ext">([["m1", "dom"]]);
const ev = (e: object) => ({ matchId: "m1", cote: "dom" as const, minute: 10, type: "tir", ...e });

describe("minutes deduites du direct", () => {
  const evs = [
    ev({ type: "remplacement", minute: 46, joueurId: "a", joueur2Id: "x" }),
    ev({ type: "carton_rouge", minute: 58, joueurId: "b" }),
    ev({ type: "remplacement", minute: 70, joueurId: "x", joueur2Id: "y" }),
    ev({ type: "tir", minute: 93 }),                                           // temps additionnel : le match dure 93 minutes
    ev({ cote: "ext", type: "remplacement", minute: 30, joueurId: "c", joueur2Id: "z" }),   // l'adversaire ne change rien
  ];
  const minutes = (id: string) => presencesDuDirect(id, [plan], evs, cotes).get("m1");

  it("un titulaire joue jusqu'a sa sortie, un expulse jusqu'a son rouge, un titulaire sans mouvement jusqu'a la fin", () => {
    expect(minutes("a")).toEqual({ minutes: 46, titulaire: true, numero: 2 });
    expect(minutes("b")).toEqual({ minutes: 58, titulaire: true, numero: null });
    expect(minutes("c")).toMatchObject({ minutes: 93, titulaire: true });
  });

  it("un entrant joue de son entree a sa sortie ou a la fin ; qui n'est ni dans le onze ni entre n'a pas de presence", () => {
    expect(minutes("x")).toEqual({ minutes: 24, titulaire: false, numero: 14 });
    expect(minutes("y")).toMatchObject({ minutes: 23, titulaire: false });
    expect(minutes("zzz")).toBeUndefined();
  });

  it("un match sans evenement ou sans onze de depart n'est pas couvert (la feuille de match reste la source)", () => {
    expect(presencesDuDirect("a", [plan], [], cotes).size).toBe(0);
    expect(presencesDuDirect("a", [{ ...plan, titulaires: ["a", "b"] }], evs, cotes).size).toBe(0);
  });

  it("la fusion prefere le direct et garde la feuille pour les autres matchs", () => {
    const feuille = new Map([["m1", { minutes: 90, titulaire: true, numero: 2 }], ["m2", { minutes: 30, titulaire: false, numero: null }]]);
    const f = fusionnerPresences(new Map([["m1", { minutes: 46, titulaire: true, numero: null }]]), feuille);
    expect(f.get("m1")).toEqual({ minutes: 46, titulaire: true, numero: 2 });
    expect(f.get("m2")).toEqual({ minutes: 30, titulaire: false, numero: null });
  });
});
