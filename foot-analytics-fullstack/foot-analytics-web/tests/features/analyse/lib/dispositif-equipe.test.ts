import { describe, expect, it } from "vitest";

import { dispositifAffiche, formationDuOnze, nomDeFamille, ordonnerPourTerrain } from "@/features/analyse/lib/dispositif-equipe";
import type { JoueurOnze, SituationClub } from "@/features/analyse/lib/situation-types";

const match = (formation: string | null) => ({ id: "m", date: "01/10/2025", journee: null, domicile: true, adversaireId: "a", bp: 1, bc: 0, issue: "V" as const, formation });
type Probable = NonNullable<SituationClub["systeme"]["probable"]>;
const situation = (probable: Probable | null, onze: SituationClub["dernierOnze"] = null): SituationClub => ({
  clubId: "c", equipeId: "e", saisonId: "s",
  systeme: {
    prediction: probable && probable.source !== "numeros"
      ? { systeme: probable.systeme, confiance: probable.confiance, observations: probable.observations, fiabilite: probable.fiabilite, alternatives: [] } : null,
    observes: probable?.observations ?? 0, matchs: 5, dernierMatchId: "m", probable,
  },
  dernierMatch: match(null), dernierOnze: onze,
});
const pred = (systeme: string, observations = 3, source: Probable["source"] = "renseigne", matchsNumeros = 0): Probable => ({
  systeme, confiance: 60, fiabilite: "moyenne", source, observations, matchsNumeros, alternatives: [], indices: [],
  structure: { defense: null, attaque: null }, disposition: [[2, 4, 5, 3], [7, 6, 8, 11], [9, 10]],
});
const j = (numero: number, poste: string | null = null): JoueurOnze => ({
  numero, nom: `J${numero}`, prenom: null, licence: null, joueurId: null, poste, capitaine: false, minutes: 90,
});

describe("dispositifAffiche", () => {
  it("le dispositif observe sur les matchs renseignes, avec leur nombre", () => {
    expect(dispositifAffiche(situation(pred("4-3-3", 4)))).toEqual({ systeme: "4-3-3", source: "observe", detail: "d'apres 4 matchs renseignes" });
    expect(dispositifAffiche(situation(pred("4-3-3", 1)))!.detail).toBe("d'apres 1 match renseigne");
  });

  it("deduit des numeros de maillot quand rien n'est renseigne : dit d'ou ca vient et que c'est a confirmer", () => {
    expect(dispositifAffiche(situation(pred("4-4-2", 0, "numeros", 6)))).toEqual({
      systeme: "4-4-2", source: "numeros", detail: "deduit des numeros de maillot sur 6 feuilles (a confirmer)",
    });
  });

  it("dispositifs renseignes recoupes par les numeros", () => {
    expect(dispositifAffiche(situation(pred("4-3-3", 3, "mixte", 6)))).toEqual({
      systeme: "4-3-3", source: "mixte", detail: "d'apres 3 matchs renseignes, recoupes par les numeros de maillot",
    });
  });

  it("choisi par le modele de l'IA actif : le dit, sans changer la preuve", () => {
    const parIa = { ...pred("4-3-3", 4), modele: { nom: "Modele n°2" } };
    expect(dispositifAffiche(situation(parIa))).toEqual({ systeme: "4-3-3", source: "observe", detail: "d'apres 4 matchs renseignes, choisi par l'IA (Modele n°2)" });
    expect(dispositifAffiche(situation({ ...pred("4-3-3", 3, "mixte", 6), modele: { nom: "Modele n°2" } }))!.detail).toMatch(/recoupes par les numeros de maillot, choisi par l'IA/);
  });

  it("le probable prime sur le prevu ; sans probable, le prevu (mon equipe) ; sinon rien", () => {
    expect(dispositifAffiche(situation(pred("4-3-3")), "3-5-2")!.systeme).toBe("4-3-3");
    expect(dispositifAffiche(situation(null), "3-5-2")).toMatchObject({ systeme: "3-5-2", source: "prevu" });
    expect(dispositifAffiche(situation(null), "  ")).toBeNull();
    expect(dispositifAffiche(situation(null))).toBeNull();
    expect(dispositifAffiche(null, null)).toBeNull();
  });
});

describe("formationDuOnze", () => {
  const onze = (formation: string | null): SituationClub["dernierOnze"] => ({ match: match(formation), titulaires: [], remplacants: [] });

  it("le dispositif du match quand il est renseigne, sinon le probable, sinon aucun (jamais un defaut)", () => {
    expect(formationDuOnze(situation(pred("4-3-3"), onze("5-3-2")))).toEqual({ formation: "5-3-2", exact: true });
    expect(formationDuOnze(situation(pred("4-3-3"), onze(null)))).toEqual({ formation: "4-3-3", exact: false });
    expect(formationDuOnze(situation(null, onze(null)))).toBeNull();
    expect(formationDuOnze(situation(pred("4-3-3"), null))).toBeNull();
  });
});

describe("ordonnerPourTerrain", () => {
  it("gardien, defense, milieu, attaque d'apres le poste de la fiche", () => {
    const l = [j(9, "AT"), j(5, "MD"), j(1, "GB"), j(3, "DC"), j(7, "AG")];
    expect(ordonnerPourTerrain(l).map((x) => x.numero)).toEqual([1, 3, 5, 7, 9]);
  });

  it("poste inconnu : le numero de maillot place le joueur selon la convention (7 et 11 ailiers = attaque, 8 et 10 milieu)", () => {
    const l = [j(11), j(8), j(6), j(7), j(10), j(9)];
    expect(ordonnerPourTerrain(l).map((x) => x.numero)).toEqual([6, 8, 10, 7, 9, 11]);
  });

  it("poste inconnu : repli sur le numero de maillot, sans melanger les postes connus", () => {
    const l = [j(10), j(1), j(4), j(7, "DC")];
    // J7 est un defenseur connu ; J4 (inconnu, numero 4) est range en defense, apres lui par numero.
    expect(ordonnerPourTerrain(l).map((x) => x.numero)).toEqual([1, 4, 7, 10]);
  });

  it("ne modifie pas la liste d'origine", () => {
    const l = [j(9), j(1)];
    ordonnerPourTerrain(l);
    expect(l.map((x) => x.numero)).toEqual([9, 1]);
  });
});

describe("nomDeFamille", () => {
  it("les mots en majuscules de la feuille ; a defaut le nom entier", () => {
    expect(nomDeFamille("ILUNGA BETU Stan")).toBe("ILUNGA BETU");
    expect(nomDeFamille("Martin")).toBe("Martin");
  });
});
