import {
  estFormationInventee, formationValide, normaliserFormation, ObservationSysteme, predireSysteme, systemesRenseignes,
} from "./systeme";

describe("formationValide / normaliserFormation", () => {
  it.each(["4-4-2", "4-2-3-1", "3-5-2", "5-3-2", "4-1-4-1", "4-3-3"])("%s est valide", (f) => expect(formationValide(f)).toBe(true));
  it.each(["4-4-3", "4-4", "abc", "", null, "4-4-2-1-1-1", "0-5-5", "7-2-1"])("%s est invalide", (f) => expect(formationValide(f as string)).toBe(false));

  it("normalise la saisie : espaces et tirets typographiques, vide -> null", () => {
    expect(normaliserFormation(" 4 - 3 - 3 ")).toBe("4-3-3");
    expect(normaliserFormation("4–2–3–1")).toBe("4-2-3-1");
    expect(normaliserFormation("   ")).toBeNull();
    expect(normaliserFormation(null)).toBeNull();
    expect(normaliserFormation("n'importe quoi")).toBe("n'importequoi");
  });
});

describe("couple invente par l'ancien import", () => {
  it("est reconnu, et ecarte des systemes renseignes", () => {
    const invente = { formationDom: "4-4-2", formationExt: "4-2-3-1" };
    expect(estFormationInventee(invente)).toBe(true);
    expect(systemesRenseignes(invente)).toEqual({ dom: null, ext: null });
  });

  it("un systeme saisi, meme identique a l'un des deux, est garde tant que le couple n'est pas complet", () => {
    expect(systemesRenseignes({ formationDom: "4-4-2", formationExt: "3-5-2" })).toEqual({ dom: "4-4-2", ext: "3-5-2" });
    expect(systemesRenseignes({ formationDom: "4-4-2", formationExt: null })).toEqual({ dom: "4-4-2", ext: null });
    expect(estFormationInventee({ formationDom: "4-2-3-1", formationExt: "4-4-2" })).toBe(false);
  });

  it("valeur illisible : ecartee", () => {
    expect(systemesRenseignes({ formationDom: "?", formationExt: "4-3-3" })).toEqual({ dom: null, ext: "4-3-3" });
  });
});

describe("predireSysteme", () => {
  const obs = (...l: [string, string][]): ObservationSysteme[] => l.map(([date, systeme]) => ({ date, systeme }));

  it("aucune observation (ou illisibles) : pas de prediction, jamais une valeur par defaut", () => {
    expect(predireSysteme([])).toBeNull();
    expect(predireSysteme(obs(["01/09/2025", "n/a"]))).toBeNull();
  });

  it("un seul match renseigne : ce systeme, fiabilite faible", () => {
    expect(predireSysteme(obs(["01/09/2025", "4-3-3"]))).toEqual({
      systeme: "4-3-3", confiance: 100, observations: 1, fiabilite: "faible", alternatives: [],
    });
  });

  it("le systeme le plus frequent gagne, les matchs recents pesant plus", () => {
    const p = predireSysteme(obs(
      ["07/09/2025", "4-4-2"], ["14/09/2025", "4-4-2"], ["21/09/2025", "4-4-2"], ["05/10/2025", "4-3-3"], ["12/10/2025", "4-3-3"],
    ))!;
    // poids : 4-3-3 = 5 + 4 = 9 ; 4-4-2 = 3 + 2 + 1 = 6 -> les deux derniers matchs l'emportent.
    expect(p).toMatchObject({ systeme: "4-3-3", confiance: 60, observations: 5, fiabilite: "bonne" });
    expect(p.alternatives).toEqual([{ systeme: "4-4-2", poids: 40 }]);
  });

  it("dates comparees comme des dates (2026 apres 2025), pas comme des chaines", () => {
    const p = predireSysteme(obs(["22/11/2025", "4-4-2"], ["06/09/2026", "3-5-2"]))!;
    expect(p.systeme).toBe("3-5-2");      // "06/09/2026" < "22/11/2025" comme chaine
  });

  it("deux matchs, deux systemes : le plus recent pese plus", () => {
    const p = predireSysteme(obs(["01/10/2025", "4-4-2"], ["02/10/2025", "4-3-3"]))!;
    expect(p).toMatchObject({ systeme: "4-3-3", confiance: 67 });
    expect(p.alternatives).toEqual([{ systeme: "4-4-2", poids: 33 }]);
  });

  it("egalite parfaite de poids : le systeme du match le plus recent", () => {
    // 4 matchs : poids 4, 3, 2, 1 -> A (recent) = 4 + 1 = 5 contre B = 3 + 2 = 5.
    const p = predireSysteme(obs(["04/10/2025", "4-3-3"], ["03/10/2025", "4-4-2"], ["02/10/2025", "4-4-2"], ["01/10/2025", "4-3-3"]))!;
    expect(p.systeme).toBe("4-3-3");
    expect(p.confiance).toBe(50);
  });

  it("seules les `fenetre` dernieres observations comptent", () => {
    const anciennes = Array.from({ length: 6 }, (_, i) => [`0${i + 1}/09/2025`, "4-4-2"] as [string, string]);
    const p = predireSysteme(obs(...anciennes, ["01/11/2025", "3-5-2"], ["08/11/2025", "3-5-2"]), 3)!;
    expect(p).toMatchObject({ systeme: "3-5-2", observations: 3 });
  });

  it("fiabilite selon le nombre de matchs : faible, moyenne, bonne", () => {
    const n = (k: number) => predireSysteme(Array.from({ length: k }, (_, i) => ({ date: `0${i + 1}/09/2025`, systeme: "4-4-2" })))!.fiabilite;
    expect([n(1), n(2), n(3), n(4), n(5), n(8)]).toEqual(["faible", "faible", "moyenne", "moyenne", "bonne", "bonne"]);
  });
});
