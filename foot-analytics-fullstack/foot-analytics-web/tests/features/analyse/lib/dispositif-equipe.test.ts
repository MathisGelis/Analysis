import { describe, expect, it } from "vitest";

import { dispositifAffiche, formationDuOnze, nomDeFamille, ordonnerPourTerrain } from "@/features/analyse/lib/dispositif-equipe";
import type { JoueurOnze, SituationClub } from "@/features/analyse/lib/situation-types";

const match = (formation: string | null) => ({ id: "m", date: "01/10/2025", journee: null, domicile: true, adversaireId: "a", bp: 1, bc: 0, issue: "V" as const, formation });
const situation = (prediction: SituationClub["systeme"]["prediction"], onze: SituationClub["dernierOnze"] = null): SituationClub => ({
  clubId: "c", equipeId: "e", saisonId: "s",
  systeme: { prediction, observes: prediction?.observations ?? 0, matchs: 5, dernierMatchId: "m" },
  dernierMatch: match(null), dernierOnze: onze,
});
const pred = (systeme: string, observations = 3) => ({ systeme, confiance: 60, observations, fiabilite: "moyenne" as const, alternatives: [] });
const j = (numero: number, poste: string | null = null): JoueurOnze => ({
  numero, nom: `J${numero}`, prenom: null, licence: null, joueurId: null, poste, capitaine: false, minutes: 90,
});

describe("dispositifAffiche", () => {
  it("le dispositif observe sur les matchs renseignes, avec leur nombre", () => {
    expect(dispositifAffiche(situation(pred("4-3-3", 4)))).toEqual({ systeme: "4-3-3", source: "observe", detail: "d'apres 4 matchs renseignes" });
    expect(dispositifAffiche(situation(pred("4-3-3", 1)))!.detail).toBe("d'apres 1 match renseigne");
  });

  it("l'observe prime sur le prevu ; sans observation, le prevu (mon equipe) ; sinon rien", () => {
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
