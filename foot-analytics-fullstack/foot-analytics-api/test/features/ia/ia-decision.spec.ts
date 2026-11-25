import { decider, MIN_FEUILLES_COMPARAISON, modelesAElaguer, prochainNumeroModele } from "@/features/ia/ia-decision";
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

describe("historique des modèles", () => {
  const m = (id: string, onze: number | null, extra: Partial<{ actif: boolean; perte: number | null; creeLe: string }> = {}) =>
    ({ id, actif: false, creeLe: "2026-01-01T00:00:00.000Z", ...extra, resume: { onze, perte: extra.perte ?? null } });

  it("garde les 5 meilleurs (part du onze, puis perte, puis le plus récent)", () => {
    const tous = [m("a", 0.5), m("b", 0.7), m("c", 0.6), m("d", 0.9), m("e", 0.4), m("f", 0.8), m("g", 0.3)];
    expect(modelesAElaguer(tous).sort()).toEqual(["e", "g"]);
    expect(modelesAElaguer(tous, 3).sort()).toEqual(["a", "c", "e", "g"]);
  });

  it("à égalité de onze : la perte la plus basse, puis le plus récent", () => {
    const tous = [m("a", 0.6, { perte: 0.9 }), m("b", 0.6, { perte: 0.5 }), m("c", 0.6, { perte: 0.5, creeLe: "2026-02-01T00:00:00.000Z" })];
    expect(modelesAElaguer(tous, 2)).toEqual(["a"]);
    expect(modelesAElaguer(tous, 1)).toEqual(["a", "b"]);
  });

  it("le modèle actif n'est jamais supprimé, même hors des meilleurs ; rien à supprimer sous la limite", () => {
    const tous = [m("a", 0.9), m("b", 0.8), m("c", 0.7), m("faible", 0.1, { actif: true })];
    expect(modelesAElaguer(tous, 2)).toEqual(["b", "c"]);
    expect(modelesAElaguer(tous.slice(0, 3), 5)).toEqual([]);
  });

  it("un modèle sans score passe après ceux qui en ont un", () => {
    expect(modelesAElaguer([m("a", null), m("b", 0.2)], 1)).toEqual(["a"]);
  });

  it("numéro du prochain modèle : un de plus que le plus grand, même si l'historique est élagué", () => {
    expect(prochainNumeroModele([])).toBe(1);
    expect(prochainNumeroModele(["Modele n°3", "Modele n°9", "Modele n°5"])).toBe(10);
  });
});
