import { decider, MIN_FEUILLES_COMPARAISON } from "@/features/ia/ia-decision";
import type { ComparaisonActif, MesureComparaison } from "@/features/ia/ia-entrainement";

const mesure = (onze: number, perte = 0.4): MesureComparaison => ({ onze, postes: null, perte });
const comparaison = (nouveau: MesureComparaison, ancien: MesureComparaison, feuilles = 40): ComparaisonActif => ({
  actif: { id: "m1", nom: "Modele n°1" }, depuis: "Semaine du 06/10/2025", semaines: 3, feuilles, nouveau, ancien,
});

describe("decider : le nouveau modele remplace-t-il l'actif ?", () => {
  it("meilleur : il remplace", () => {
    const d = decider(true, comparaison(mesure(0.72), mesure(0.70)));
    expect(d.action).toBe("remplace");
    expect(d.raison).toMatch(/Meilleur que Modele n°1.*72,0 %.*70,0 %/);
  });

  it("moins bon : l'actif est conserve, le nouveau reste dans l'historique", () => {
    const d = decider(true, comparaison(mesure(0.69), mesure(0.70)));
    expect(d.action).toBe("conserve");
    expect(d.raison).toMatch(/Moins bon.*historique/);
  });

  it("aussi bon (meme part de titulaires) : il remplace si ses probabilites ne sont pas moins bien calibrees", () => {
    expect(decider(true, comparaison(mesure(0.7, 0.40), mesure(0.7, 0.45))).action).toBe("remplace");
    expect(decider(true, comparaison(mesure(0.7, 0.40), mesure(0.7, 0.40))).action).toBe("remplace");
    const pire = decider(true, comparaison(mesure(0.7, 0.50), mesure(0.7, 0.40)));
    expect(pire.action).toBe("conserve");
    expect(pire.raison).toMatch(/moins bien calibrees/);
  });

  it("trop peu de feuilles posterieures : comparaison impossible, l'actif est conserve", () => {
    const d = decider(true, comparaison(mesure(0.9), mesure(0.5), MIN_FEUILLES_COMPARAISON - 1));
    expect(d.action).toBe("conserve");
    expect(d.raison).toMatch(/comparaison impossible/);
    expect(decider(true, comparaison(mesure(0.9), mesure(0.5), MIN_FEUILLES_COMPARAISON)).action).toBe("remplace");
    expect(decider(true, null).action).toBe("conserve");                      // aucune feuille nouvelle
  });

  it("aucun modele actif : jamais d'activation automatique", () => {
    const d = decider(false, null);
    expect(d.action).toBe("sans_actif");
    expect(d.comparaison).toBeNull();
  });
});
