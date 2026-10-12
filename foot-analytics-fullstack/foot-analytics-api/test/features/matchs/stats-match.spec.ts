import { cumuler, statsDuMatch, STATS_MATCH_VIDES } from "@/features/matchs/stats-match";

const compo = (nom: string, prenom: string, cote: "dom" | "ext" = "dom") => ({ nom, prenom, cote });
const evt = (type: string, joueur: string, equipe: "dom" | "ext" = "dom", extra: object = {}) =>
  ({ type, sousType: null, joueur, joueur2: null, equipe, ...extra }) as any;

describe("statsDuMatch", () => {
  it("compte les buts du joueur, et la passe sur le joueur2 du meme evenement", () => {
    const evts = [
      evt("but", "LAZIBU Zide", "dom", { joueur2: "MARCON Leo" }),
      evt("but", "MARCON Leo", "dom", { joueur2: "LAZIBU Zide" }),
      evt("but", "LAZIBU Zide", "dom"),
    ];
    expect(statsDuMatch(compo("LAZIBU", "Zide"), evts)).toEqual({ buts: 2, passesDecisives: 1, cartonsJaunes: 0, cartonsRouges: 0 });
    expect(statsDuMatch(compo("MARCON", "Leo"), evts)).toEqual({ buts: 1, passesDecisives: 1, cartonsJaunes: 0, cartonsRouges: 0 });
  });

  it("distingue deux joueurs de meme nom de famille par le prenom", () => {
    const evts = [evt("but", "LAZIBU Zide"), evt("carton", "LAZIBU Lagur", "dom", { sousType: "jaune" })];
    expect(statsDuMatch(compo("LAZIBU", "Lagur"), evts)).toMatchObject({ buts: 0, cartonsJaunes: 1 });
    expect(statsDuMatch(compo("LAZIBU", "Zide"), evts)).toMatchObject({ buts: 1, cartonsJaunes: 0 });
  });

  it("ignore les evenements de l'autre cote", () => {
    const evts = [evt("but", "LAZIBU Zide", "ext"), evt("carton", "LAZIBU Zide", "ext", { sousType: "jaune" })];
    expect(statsDuMatch(compo("LAZIBU", "Zide", "dom"), evts)).toEqual(STATS_MATCH_VIDES);
  });

  it("le double jaune compte comme un rouge, pas comme un jaune", () => {
    const evts = [evt("carton", "AMI Paul", "dom", { sousType: "double_jaune" }), evt("carton", "AMI Paul", "dom", { sousType: "rouge" })];
    expect(statsDuMatch(compo("AMI", "Paul"), evts)).toMatchObject({ cartonsJaunes: 0, cartonsRouges: 2 });
  });

  it("ne compte pas un but contre son camp", () => {
    expect(statsDuMatch(compo("AMI", "Paul"), [evt("but", "AMI Paul", "dom", { sousType: "csc" })])).toEqual(STATS_MATCH_VIDES);
  });

  it("cumuler additionne les compteurs", () => {
    expect(cumuler({ buts: 1, passesDecisives: 2, cartonsJaunes: 0, cartonsRouges: 1 }, { buts: 2, passesDecisives: 0, cartonsJaunes: 1, cartonsRouges: 0 }))
      .toEqual({ buts: 3, passesDecisives: 2, cartonsJaunes: 1, cartonsRouges: 1 });
  });
});
