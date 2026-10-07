import { ligneDuNumero, numeroDePoste, LIBELLE_POSTE, NUMEROS_DE_POSTE, posteDuNumero, POSTE_PAR_NUMERO, posteFiche } from "@/features/matchs/numeros-postes";

describe("convention numero -> poste", () => {
  it("suit celle du staff : 1 GB, 2 DD, 3 DG, 4 DCD, 5 DCG, 6 MDC, 7 AG, 8 MC, 9 BU, 10 MO, 11 AD", () => {
    expect(NUMEROS_DE_POSTE.map((n) => posteDuNumero(n))).toEqual(["GB", "DD", "DG", "DCD", "DCG", "MDC", "AG", "MC", "BU", "MO", "AD"]);
    for (const poste of Object.values(POSTE_PAR_NUMERO)) expect(LIBELLE_POSTE[poste]).toBeTruthy();
  });

  it("le 16 est un gardien : poste, ligne et fiche", () => {
    expect(posteDuNumero(16)).toBe("GB");
    expect(ligneDuNumero(16)).toBe("GB");
    expect(posteFiche(16)).toBe("GB");
    expect(numeroDePoste(16)).toBe(1);
    expect([1, 5, 11, 12, 23].map(numeroDePoste)).toEqual([1, 5, 11, 12, 23]);
  });

  it("au-dela de 11, ou hors entier : pas de poste (un remplacant)", () => {
    for (const n of [0, 12, 23, -1, 4.5, NaN, null, undefined]) {
      expect(posteDuNumero(n as number)).toBeNull();
      expect(ligneDuNumero(n as number)).toBeNull();
      expect(posteFiche(n as number)).toBeNull();
    }
  });

  it("donne la ligne : gardien, defense (2 a 5), milieu (6, 8, 10), attaque (7, 9, 11)", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => ligneDuNumero(n)))
      .toEqual(["GB", "DEF", "DEF", "DEF", "DEF", "MIL", "ATT", "MIL", "ATT", "MIL", "ATT"]);
  });

  it("poste de fiche, dans le vocabulaire de l'effectif (DC pour 4 et 5, MD pour 6, AT pour 9)", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => posteFiche(n)))
      .toEqual(["GB", "DD", "DG", "DC", "DC", "MD", "AG", "MC", "AT", "MO", "AD"]);
  });
});
