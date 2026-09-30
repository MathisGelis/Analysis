import { describe, expect, it } from "vitest";
import { choisirSaisonFiche, indiceDiscipline, numeroPrincipal, TOTAUX_VIDES } from "./fiche-joueur";
import type { HistoriqueSaison } from "./types";

const totaux = (o: Partial<typeof TOTAUX_VIDES> = {}) => ({ ...TOTAUX_VIDES, ...o });
const saison = (id: string, actif = false) => ({ id, nom: id, actif });
const histo = (saisonId: string, t = totaux()): HistoriqueSaison => ({
  saisonId, saisonNom: saisonId, anneeDebut: 2025, saisonActive: false, totaux: t,
  lignes: [{ clubId: "c", equipeId: "e-" + saisonId, equipeNom: "Seniors", competitionLibelle: null, poule: null,
    matchs: t.matchs, titularisations: 0, minutes: 0, buts: t.buts, passesDecisives: 0, cartonsJaunes: 0, cartonsRouges: 0,
    noteMoyenne: null, numeros: {} }],
});
const saisons = [saison("s26", true), saison("s25"), saison("s24")];

describe("choisirSaisonFiche", () => {
  const historique = [histo("s25", totaux({ matchs: 20, buts: 7 })), histo("s24", totaux({ matchs: 10, buts: 2 }))];

  it("l'URL prime sur le cookie", () => {
    const r = choisirSaisonFiche({ historique, saisons, demandee: "s24", cookie: "s25" });
    expect(r.saison?.id).toBe("s24");
    expect(r.totaux.buts).toBe(2);
  });

  it("le cookie prime sur la saison active", () => {
    expect(choisirSaisonFiche({ historique, saisons, cookie: "s25" }).totaux.buts).toBe(7);
  });

  it("saison sans participation : totaux a zero, jamais ceux d'une autre saison", () => {
    const r = choisirSaisonFiche({ historique, saisons, cookie: "s26" });
    expect(r.saison?.id).toBe("s26");
    expect(r.entree).toBeNull();
    expect(r.ligne).toBeNull();
    expect(r.totaux).toEqual(TOTAUX_VIDES);
  });

  it("id inconnu ignore : retombe sur la saison active", () => {
    expect(choisirSaisonFiche({ historique, saisons, demandee: "zzz", cookie: "yyy" }).saison?.id).toBe("s26");
  });

  it("sans saison active ni cookie : la plus recente du parcours", () => {
    const r = choisirSaisonFiche({ historique, saisons: [saison("s25"), saison("s24")] });
    expect(r.saison?.id).toBe("s25");
  });

  it("aucune saison connue : tout vide sans planter", () => {
    const r = choisirSaisonFiche({ historique: [], saisons: [] });
    expect(r).toMatchObject({ saison: null, entree: null, ligne: null, totaux: TOTAUX_VIDES });
  });

  it("expose la ligne principale de la saison", () => {
    expect(choisirSaisonFiche({ historique, saisons, cookie: "s25" }).ligne?.equipeId).toBe("e-s25");
  });
});

describe("numeroPrincipal", () => {
  it("le plus porte", () => expect(numeroPrincipal({ "6": 3, "8": 5, "10": 1 })).toBe(8));
  it("aucun", () => expect(numeroPrincipal({})).toBeNull());
});

describe("indiceDiscipline", () => {
  it("100 sans carton", () => expect(indiceDiscipline({ cartonsJaunes: 0, cartonsRouges: 0 })).toBe(100));
  it("un rouge vaut trois jaunes", () => {
    expect(indiceDiscipline({ cartonsJaunes: 0, cartonsRouges: 1 })).toBe(indiceDiscipline({ cartonsJaunes: 3, cartonsRouges: 0 }));
  });
  it("jamais negatif", () => expect(indiceDiscipline({ cartonsJaunes: 30, cartonsRouges: 5 })).toBe(0));
});
