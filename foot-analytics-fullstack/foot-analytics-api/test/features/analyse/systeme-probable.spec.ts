import { analyserNumeros, LigneFeuille } from "@/features/analyse/compo-numeros";
import { fusionnerSystemes } from "@/features/analyse/systeme-probable";
import { PredictionSysteme } from "@/features/matchs/systeme";

function feuille(matchId: string, date: string, numeros: Record<string, number> = {}): LigneFeuille[] {
  return Array.from({ length: 11 }, (_, i) => {
    const joueur = `p${i + 1}`;
    return { matchId, date, journee: null, joueur, nom: `Joueur ${i + 1}`, numero: numeros[joueur] ?? i + 1, titulaire: true };
  });
}
const saison = (...c: Record<string, number>[]) => c.flatMap((x, i) => feuille(`m${i + 1}`, `${String(1 + 7 * i).padStart(2, "0")}/09/2025`, x));

const deuxAttaquants = analyserNumeros(saison({ p9: 10, p10: 9 }, {}, { p9: 10, p10: 9 }, {}, { p9: 10, p10: 9 }, {}));   // pointe vers 4-4-2
const sansIndice = analyserNumeros(saison({}, {}, {}));

const saisi = (systeme: string, observations: number, confiance = 100, alternatives: PredictionSysteme["alternatives"] = []): PredictionSysteme => ({
  systeme, confiance, observations, fiabilite: observations >= 5 ? "bonne" : observations >= 3 ? "moyenne" : "faible", alternatives,
});

describe("fusionnerSystemes", () => {
  it("ni dispositif saisi ni changement de numero : pas de systeme", () => {
    expect(fusionnerSystemes(null, null)).toBeNull();
    expect(fusionnerSystemes(null, sansIndice)).toBeNull();
  });

  it("dispositif saisi seul : repris tel quel, source renseigne", () => {
    const r = fusionnerSystemes(saisi("4-3-3", 4, 75, [{ systeme: "4-4-2", poids: 25 }]), sansIndice)!;
    expect(r).toMatchObject({
      systeme: "4-3-3", confiance: 75, fiabilite: "moyenne", source: "renseigne", observations: 4, matchsNumeros: 3,
      alternatives: [{ systeme: "4-4-2", poids: 25 }],
    });
    expect(r.indices).toEqual(["Dispositif renseigne par le staff sur 4 matchs."]);
    expect(r.structure.defense).toEqual({ lignes: 4, part: 100 });
  });

  it("numeros seuls : une estimation prudente, jamais 'bonne', plafonnee, avec ses indices", () => {
    const r = fusionnerSystemes(null, deuxAttaquants)!;
    expect(r.systeme).toBe("4-4-2");
    expect(r.source).toBe("numeros");
    expect(r.observations).toBe(0);
    expect(r.matchsNumeros).toBe(6);
    expect(["faible", "moyenne"]).toContain(r.fiabilite);
    expect(r.confiance).toBeLessThanOrEqual(70);
    expect(r.alternatives.map((a) => a.systeme)).toEqual(["3-5-2", "5-3-2"]);
    expect(r.indices[0]).toMatch(/Deduit des changements de numero sur 6 feuilles : aucun dispositif renseigne/);
    expect(r.indices.some((i) => /deux attaquants/.test(i))).toBe(true);
  });

  it("les deux concordent : le systeme saisi, plus de confiance qu'avec le seul poids des numeros, fiabilite du staff", () => {
    const r = fusionnerSystemes(saisi("4-4-2", 5, 100), deuxAttaquants)!;
    expect(r).toMatchObject({ systeme: "4-4-2", source: "mixte", fiabilite: "bonne", observations: 5, matchsNumeros: 6 });
    expect(r.confiance).toBeGreaterThanOrEqual(90);
    expect(r.indices[1]).toBe("Les changements de numero vont dans le meme sens.");
  });

  it("les deux divergent : le dispositif saisi garde la tete, la confiance baisse, la fiabilite aussi, la divergence est dite", () => {
    const r = fusionnerSystemes(saisi("4-3-3", 3, 100), deuxAttaquants)!;
    expect(r.systeme).toBe("4-3-3");
    expect(r.source).toBe("mixte");
    expect(r.confiance).toBeLessThan(100);
    expect(r.fiabilite).toBe("faible");          // "moyenne" (3 matchs) abaissee d'un cran
    expect(r.indices[1]).toBe("Les changements de numero ne confirment pas ce systeme (ils pointent vers 4-4-2).");
    expect(r.alternatives.map((a) => a.systeme)).toContain("4-4-2");
  });

  it("dispositif saisi compatible avec les numeros sans etre leur premier choix : verdict nuance, fiabilite gardee", () => {
    const r = fusionnerSystemes(saisi("3-5-2", 5, 100), deuxAttaquants)!;
    expect(r.systeme).toBe("3-5-2");
    expect(r.fiabilite).toBe("bonne");
    expect(r.indices[1]).toBe("Les changements de numero sont compatibles (mais pointent plutot vers 4-4-2).");
  });

  it("une seule observation saisie ne l'emporte pas sur des numeros nets", () => {
    const r = fusionnerSystemes(saisi("4-3-3", 1, 100), deuxAttaquants)!;
    expect(r.systeme).toBe("4-3-3");          // le dispositif saisi pese 50 % (1 match)
    expect(r.alternatives[0].systeme).toBe("4-4-2");
    expect(r.confiance).toBeLessThan(75);
  });
});
