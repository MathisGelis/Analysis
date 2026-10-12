import { describe, expect, it } from "vitest";

import {
  idsDesNiveaux, libelleNiveau, modeSaisons, niveauxAttribuables, niveauxCoches, resumeSaisons, saisonActuelle, saisonsPassees,
} from "@/features/comptes/lib/acces-saisons";

const S = (id: string, anneeDebut: number, actif = false) => ({ id, nom: `${anneeDebut}-${anneeDebut + 1}`, anneeDebut, actif });
const s23 = S("s23", 2023), s24 = S("s24", 2024), s25 = S("s25", 2025), s26 = S("s26", 2026, true), s27 = S("s27", 2027);
const saisons = [s24, s26, s23, s27, s25];                 // volontairement en desordre

const E = (id: string, saisonId: string, extra: Record<string, unknown> = {}) => ({
  id, clubId: "ol", nom: "Seniors D2 Poule A", categorie: "Seniors", division: "D2",
  competitionLibelle: "Seniors D2", poule: "A", saisonId, ...extra,
});

describe("saisonActuelle", () => {
  it("la plus recente des saisons actives ; sinon la plus recente", () => {
    expect(saisonActuelle(saisons)?.id).toBe("s26");
    expect(saisonActuelle([S("a", 2024), S("b", 2025)])?.id).toBe("b");
    expect(saisonActuelle([S("a", 2024, true), S("b", 2025, true)])?.id).toBe("b");
    expect(saisonActuelle([])).toBeNull();
  });
});

describe("saisonsPassees", () => {
  it("les saisons passees, de la plus recente a la plus ancienne", () => {
    expect(saisonsPassees(saisons).map((s) => s.id)).toEqual(["s25", "s24", "s23"]);
    expect(saisonsPassees([])).toEqual([]);
  });
});

describe("libelleNiveau : sans la poule", () => {
  it("categorie + division", () => {
    expect(libelleNiveau({ categorie: "Seniors", division: "D2", nom: "Seniors D2 Poule A" })).toBe("Seniors D2");
    expect(libelleNiveau({ categorie: "U17", division: "R1", nom: "U17 R1 Poule B" })).toBe("U17 R1");
  });

  it("sans categorie ou division : le nom prive de sa poule", () => {
    expect(libelleNiveau({ categorie: null, division: null, nom: "Seniors D2 Poule A" })).toBe("Seniors D2");
    expect(libelleNiveau({ categorie: "Seniors", division: null, nom: "Seniors - Poule C" })).toBe("Seniors");
    expect(libelleNiveau({ categorie: null, division: null, nom: "Veterans" })).toBe("Veterans");
    expect(libelleNiveau({ categorie: null, division: null, nom: "Poule A" })).toBe("Poule A");
  });
});

describe("niveauxAttribuables : les equipes de la saison actuelle", () => {
  const equipes = [
    E("sen26", "s26"), E("sen25", "s25", { poule: "C", nom: "Seniors D2 Poule C" }),
    E("u17-26", "s26", { categorie: "U17", division: "R1", nom: "U17 R1 Poule B", competitionLibelle: "U17 R1", poule: "B" }),
    E("autre-club", "s26", { clubId: "mions" }),
  ];

  it("un niveau par equipe du club, sans poule, tries ; les autres saisons et les autres clubs sont ecartes", () => {
    const n = niveauxAttribuables(equipes, "ol", "s26");
    expect(n.map((x) => x.libelle)).toEqual(["Seniors D2", "U17 R1"]);
    expect(n[0].ids).toEqual(["sen26"]);
  });

  it("deux poules d'un meme niveau ne font qu'une ligne, qui attribue les deux", () => {
    const n = niveauxAttribuables([...equipes, E("sen26b", "s26", { poule: "B", nom: "Seniors D2 Poule B" })], "ol", "s26");
    expect(n.filter((x) => x.libelle === "Seniors D2")).toHaveLength(1);
    expect(n.find((x) => x.libelle === "Seniors D2")!.ids).toEqual(["sen26", "sen26b"]);
  });

  it("aucune saison : aucun niveau", () => {
    expect(niveauxAttribuables(equipes, "ol", null)).toEqual([]);
  });
});

describe("niveauxCoches : ce que le compte voit vraiment", () => {
  const equipes = [
    E("sen26", "s26"), E("sen25", "s25", { poule: "C", nom: "Seniors D2 Poule C", competitionLibelle: "Seniors D2" }),
    E("u17-26", "s26", { categorie: "U17", division: "R1", nom: "U17 R1 Poule B", competitionLibelle: "U17 R1", poule: "B" }),
  ];
  const niveaux = niveauxAttribuables(equipes, "ol", "s26");

  it("coche le niveau d'une equipe de la saison actuelle", () => {
    expect(niveauxCoches(niveaux, equipes, ["sen26"]).size).toBe(1);
    expect(idsDesNiveaux(niveaux, niveauxCoches(niveaux, equipes, ["sen26"]))).toEqual(["sen26"]);
  });

  it("un compte attribue sur la saison precedente (poule differente) a le meme niveau coche", () => {
    const coches = niveauxCoches(niveaux, equipes, ["sen25"]);
    expect(idsDesNiveaux(niveaux, coches)).toEqual(["sen26"]);
  });

  it("aucune equipe attribuee : rien de coche (le compte voit toutes les equipes du club)", () => {
    expect(niveauxCoches(niveaux, equipes, []).size).toBe(0);
    expect(idsDesNiveaux(niveaux, new Set())).toEqual([]);
  });
});

describe("mode et resume des saisons d'un compte", () => {
  it("mode : toutes, saison actuelle seule, ou choix", () => {
    expect(modeSaisons({ role: "user" })).toBe("toutes");
    expect(modeSaisons({ role: "user", toutesSaisons: false, saisonIds: [] })).toBe("courante");
    expect(modeSaisons({ role: "user", toutesSaisons: false, saisonIds: ["s25"] })).toBe("choix");
  });

  it("resume pour la liste", () => {
    expect(resumeSaisons({ role: "admin" }, saisons)).toBe("Toutes les saisons");
    expect(resumeSaisons({ role: "user", toutesSaisons: true }, saisons)).toBe("Toutes les saisons");
    expect(resumeSaisons({ role: "user", toutesSaisons: false, saisonIds: [] }, saisons)).toBe("Saison actuelle");
    expect(resumeSaisons({ role: "user", toutesSaisons: false, saisonIds: ["s24", "s25", "fantome"] }, saisons)).toBe("Actuelle + 2025-2026 · 2024-2025");
  });
});
