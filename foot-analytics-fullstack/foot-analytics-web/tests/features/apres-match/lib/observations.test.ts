import { describe, expect, it } from "vitest";

import {
  ajouterJoueur, basculer, choisir, ecrire, ecrireJoueurs, erreursJoueurs, lireJoueurs, nbRemplies, noter, pourEnvoi, sectionRemplie,
} from "@/features/apres-match/lib/observations";

const OPTIONS = ["Haut", "Médian", "Bas", "Côté droit"];

describe("observations de l'adversaire : sélecteurs", () => {
  it("choix : un second appui sur la même option la retire, une autre option la remplace", () => {
    let v = choisir({}, "sorties", "Solides");
    expect(v).toEqual({ sorties: "Solides" });
    v = choisir(v, "sorties", "Hésitantes");
    expect(v).toEqual({ sorties: "Hésitantes" });
    expect(choisir(v, "sorties", "Hésitantes")).toEqual({});
  });

  it("multi : ajoute et retire, dans l'ordre du catalogue, et retire le champ quand il est vide", () => {
    let v = basculer({}, "zones", "Bas", OPTIONS);
    v = basculer(v, "zones", "Haut", OPTIONS);
    expect(v).toEqual({ zones: ["Haut", "Bas"] });
    v = basculer(v, "zones", "Haut", OPTIONS);
    expect(v).toEqual({ zones: ["Bas"] });
    expect(basculer(v, "zones", "Bas", OPTIONS)).toEqual({});
  });

  it("note : de 1 à 5, un second appui sur la même note l'efface ; le texte vide est retiré", () => {
    expect(noter({}, "efficacite", 4)).toEqual({ efficacite: 4 });
    expect(noter({ efficacite: 4 }, "efficacite", 4)).toEqual({});
    expect(ecrire({}, "remarque", "Haut et agressif")).toEqual({ remarque: "Haut et agressif" });
    expect(ecrire({ remarque: "x" }, "remarque", "   ")).toEqual({});
    expect(ecrire({}, "remarque", "a".repeat(400)).remarque).toHaveLength(300);
  });

  it("ne modifie jamais l'objet reçu", () => {
    const v = { zones: ["Haut"] };
    basculer(v, "zones", "Bas", OPTIONS);
    choisir(v as any, "x", "y");
    expect(v).toEqual({ zones: ["Haut"] });
  });
});

describe("observations de l'adversaire : joueurs par numéro", () => {
  it("trois joueurs au plus, numéros de 1 à 99 sans doublon", () => {
    let l = ajouterJoueur([]);
    l = ajouterJoueur(ajouterJoueur(ajouterJoueur(l)));
    expect(l).toHaveLength(3);
    expect(erreursJoueurs([{ numero: 7 }, { numero: 10 }])).toBeNull();
    expect(erreursJoueurs([{ numero: 0 }])).toMatch(/1 à 99/);
    expect(erreursJoueurs([{ numero: 100 }])).toMatch(/1 à 99/);
    expect(erreursJoueurs([{ numero: 7 }, { numero: 7 }])).toMatch(/une fois/);
  });

  it("lecture et écriture ; une liste vide retire le champ", () => {
    expect(lireJoueurs({}, "joueurs")).toEqual([]);
    const v = ecrireJoueurs({}, "joueurs", [{ numero: 10, commentaire: "Gaucher" }]);
    expect(lireJoueurs(v, "joueurs")).toEqual([{ numero: 10, commentaire: "Gaucher" }]);
    expect(ecrireJoueurs(v, "joueurs", [])).toEqual({});
  });

  it("à l'envoi : les numéros invalides ou en double restent de côté, le reste de la section part", () => {
    expect(pourEnvoi({ joueurs: [{ numero: 0 }, { numero: 7, commentaire: "Rapide" }, { numero: 7 }, { numero: 120 }], remarque: "ok" }))
      .toEqual({ joueurs: [{ numero: 7, commentaire: "Rapide" }], remarque: "ok" });
    expect(pourEnvoi({ joueurs: [{ numero: 0 }] })).toEqual({});
  });

  it("avancement : seules les sections renseignées comptent", () => {
    expect(sectionRemplie(undefined)).toBe(false);
    expect(sectionRemplie({})).toBe(false);
    expect(nbRemplies({ pressing: { efficacite: 3 }, gardien: {} })).toBe(1);
  });
});
