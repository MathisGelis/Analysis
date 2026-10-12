import { dernierMatchJoue, estSanctionRouge, expulseDansLeMatch } from "@/features/matchs/suspensions";

const evt = (sousType: string, joueur: string, equipe: "dom" | "ext" = "dom", type = "carton") => ({ type, sousType, equipe, joueur });
const compo = (nom: string, prenom: string, cote: "dom" | "ext" = "dom") => ({ nom, prenom, cote });

describe("suspensions", () => {
  it("rouge et second jaune suspendent ; un jaune non", () => {
    expect(estSanctionRouge("rouge")).toBe(true);
    expect(estSanctionRouge("double_jaune")).toBe(true);
    expect(estSanctionRouge("jaune")).toBe(false);
    expect(estSanctionRouge(null)).toBe(false);
  });

  it("expulse dans le match : le bon joueur, du bon cote, et seulement un evenement carton", () => {
    const evts = [evt("rouge", "LUDENOZ Dofufulik"), evt("jaune", "REPELEN Gekavogiv")];
    expect(expulseDansLeMatch(compo("LUDENOZ", "Dofufulik"), evts)).toBe(true);
    expect(expulseDansLeMatch(compo("REPELEN", "Gekavogiv"), evts)).toBe(false);          // un jaune
    expect(expulseDansLeMatch(compo("LUDENOZ", "Dofufulik", "ext"), evts)).toBe(false);   // l'autre equipe
    expect(expulseDansLeMatch(compo("BUVORAS", "Nadi"), [evt("rouge", "BUVORAS Nadi", "dom", "carton_staff")])).toBe(false);   // le staff
  });

  it("dernier match joue : par date, sans compter un match programme", () => {
    const m = (id: string, date: string, statut = "joue") => ({ id, date, journee: null, statut });
    expect(dernierMatchJoue([m("a", "07/09/2025"), m("c", "21/09/2025", "prevu"), m("b", "14/09/2025")])?.id).toBe("b");
    expect(dernierMatchJoue([m("a", "07/09/2025", "annule")])).toBeNull();
    expect(dernierMatchJoue([])).toBeNull();
  });
});
