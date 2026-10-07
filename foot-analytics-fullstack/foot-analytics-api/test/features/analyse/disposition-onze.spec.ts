import { dispositionDe, ordreTerrain, placesDe } from "@/features/analyse/disposition-onze";
import { formationValide } from "@/features/matchs/systeme";

describe("dispositionDe", () => {
  it("place les numeros selon le dispositif : 4-4-2, 4-3-3, 4-2-3-1", () => {
    expect(dispositionDe("4-4-2")).toEqual([[2, 4, 5, 3], [7, 6, 8, 11], [9, 10]]);
    expect(dispositionDe("4-3-3")).toEqual([[2, 4, 5, 3], [6, 8, 10], [7, 9, 11]]);
    expect(dispositionDe("4-2-3-1")).toEqual([[2, 4, 5, 3], [6, 8], [7, 10, 11], [9]]);
  });

  it("une defense a 3 ou a 5 ramene le milieu defensif (6) dans l'axe, les lateraux montent", () => {
    expect(dispositionDe("3-5-2")[0]).toEqual([4, 6, 5]);
    expect(dispositionDe("3-5-2")[1]).toEqual([2, 7, 8, 11, 3]);
    expect(dispositionDe("5-4-1")[0]).toEqual([2, 4, 6, 5, 3]);
  });

  it("espaces et copie : la table n'est jamais modifiee par l'appelant", () => {
    const d = dispositionDe(" 4 - 3 - 3 ");
    d[0].reverse();
    expect(dispositionDe("4-3-3")[0]).toEqual([2, 4, 5, 3]);
  });

  it("dispositif habituel ou non : dix numeros de champ, tous distincts, lignes de la taille du dispositif", () => {
    for (const f of ["4-4-2", "4-3-3", "4-2-3-1", "4-1-4-1", "4-5-1", "4-4-1-1", "3-5-2", "3-4-3", "5-3-2", "5-4-1", "4-1-2-1-2", "4-3-1-2", "3-4-1-2", "4-2-4", "3-3-3-1"]) {
      expect(formationValide(f)).toBe(true);
      const d = dispositionDe(f);
      expect(d.map((l) => l.length)).toEqual(f.split("-").map(Number));
      expect(d.flat().sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    }
  });

  it("dispositif hors table : remplissage du fond vers l'avant, chaque ligne ordonnee sur la largeur", () => {
    expect(dispositionDe("4-1-2-1-2")).toEqual([[2, 4, 5, 3], [6], [10, 8], [7], [9, 11]]);
  });

  it("absent, illisible ou impossible : la disposition du 4-4-2", () => {
    for (const f of [null, undefined, "", "n/a", "4-4-3", "7-2-1"]) expect(dispositionDe(f)).toEqual([[2, 4, 5, 3], [7, 6, 8, 11], [9, 10]]);
  });
});

describe("ordreTerrain / placesDe", () => {
  it("ordreTerrain : le gardien puis les lignes, l'ordre des postes du terrain", () => {
    expect(ordreTerrain("4-3-3")).toEqual([1, 2, 4, 5, 3, 6, 8, 10, 7, 9, 11]);
  });

  it("placesDe : ligne, rang et taille de ligne de chaque numero", () => {
    const places = placesDe("4-2-3-1");
    expect(places).toHaveLength(11);
    expect(places[0]).toEqual({ numero: 1, ligne: 0, rang: 0, effectif: 1 });
    expect(places.find((p) => p.numero === 10)).toEqual({ numero: 10, ligne: 3, rang: 1, effectif: 3 });
    expect(places.find((p) => p.numero === 9)).toEqual({ numero: 9, ligne: 4, rang: 0, effectif: 1 });
  });
});
