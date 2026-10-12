import { describe, expect, it } from "vitest";

import {
  ajouterJours, ajouterMois, aujourdhuiIso, borner, debutPageAnnees, formaterFrappe, grilleDuMois, isoDepuisSaisie,
  isoDepuisValeur, isoValide, libelleLong, saisieDepuisIso,
} from "@/shared/lib/selecteur-date";

describe("isoValide / conversions", () => {
  it("n'accepte que de vrais jours", () => {
    expect(isoValide("2026-10-18")).toBe(true);
    expect(isoValide("2026-02-29")).toBe(false);
    expect(isoValide("2028-02-29")).toBe(true);
    expect(isoValide("2026-13-01")).toBe(false);
    expect(isoValide("18/10/2026")).toBe(false);
    expect(isoValide("")).toBe(false);
    expect(isoValide(null)).toBe(false);
  });

  it("ISO <-> saisie JJ/MM/AAAA", () => {
    expect(saisieDepuisIso("2026-10-08")).toBe("08/10/2026");
    expect(saisieDepuisIso("n'importe quoi")).toBe("");
    expect(isoDepuisSaisie("08/10/2026")).toBe("2026-10-08");
    expect(isoDepuisSaisie("8/1/2026")).toBe("2026-01-08");
    expect(isoDepuisSaisie("08-10-2026")).toBe("2026-10-08");
    expect(isoDepuisSaisie("08.10.2026")).toBe("2026-10-08");
    expect(isoDepuisSaisie("2026-10-08")).toBe("2026-10-08");
  });

  it("refuse ce qui n'est pas une date", () => {
    expect(isoDepuisSaisie("31/02/2026")).toBeNull();
    expect(isoDepuisSaisie("12/03/26")).toBeNull();
    expect(isoDepuisSaisie("12/03")).toBeNull();
    expect(isoDepuisSaisie("bonjour")).toBeNull();
    expect(isoDepuisSaisie("")).toBeNull();
  });

  it("aujourd'hui = le jour de l'horloge locale", () => {
    expect(aujourdhuiIso(new Date(2026, 9, 1, 23, 59))).toBe("2026-10-01");
    expect(aujourdhuiIso(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });
});

describe("isoDepuisValeur", () => {
  it("lit les formats presents en base : ISO, ISO avec heure, JJ/MM/AAAA de la FMI", () => {
    expect(isoDepuisValeur("2026-10-18")).toBe("2026-10-18");
    expect(isoDepuisValeur("2026-10-18T14:00:00.000Z")).toBe("2026-10-18");
    expect(isoDepuisValeur("2026-10-18 14:00")).toBe("2026-10-18");
    expect(isoDepuisValeur("18/10/2026")).toBe("2026-10-18");
  });

  it("vide quand rien n'est lisible", () => {
    expect(isoDepuisValeur("")).toBe("");
    expect(isoDepuisValeur(null)).toBe("");
    expect(isoDepuisValeur(undefined)).toBe("");
    expect(isoDepuisValeur("2026-02-30")).toBe("");
    expect(isoDepuisValeur("bientot")).toBe("");
  });
});

describe("formaterFrappe", () => {
  it("regroupe les chiffres en JJ/MM/AAAA au fil de la frappe", () => {
    expect(formaterFrappe("1")).toBe("1");
    expect(formaterFrappe("12")).toBe("12");
    expect(formaterFrappe("123")).toBe("12/3");
    expect(formaterFrappe("1203")).toBe("12/03");
    expect(formaterFrappe("12032004")).toBe("12/03/2004");
    expect(formaterFrappe("120320041234")).toBe("12/03/2004");
  });

  it("le separateur tape apres deux chiffres est conserve, et la saisie deja formatee ne bouge pas", () => {
    expect(formaterFrappe("12/")).toBe("12/");
    expect(formaterFrappe("12/03/")).toBe("12/03/");
    expect(formaterFrappe("12/03/2004")).toBe("12/03/2004");
    expect(formaterFrappe("")).toBe("");
  });

  it("laisse intacte une date ISO collee ou une saisie non numerique", () => {
    expect(formaterFrappe("2026-10-18")).toBe("2026-10-18");
    expect(formaterFrappe("abc")).toBe("abc");
  });
});

describe("arithmetique de dates", () => {
  it("jours : passe les fins de mois et d'annee", () => {
    expect(ajouterJours("2026-10-31", 1)).toBe("2026-11-01");
    expect(ajouterJours("2026-01-01", -1)).toBe("2025-12-31");
    expect(ajouterJours("2028-02-28", 1)).toBe("2028-02-29");
    expect(ajouterJours("2026-10-18", 7)).toBe("2026-10-25");
  });

  it("mois : ramene au dernier jour du mois si besoin", () => {
    expect(ajouterMois("2026-01-31", 1)).toBe("2026-02-28");
    expect(ajouterMois("2026-12-15", 1)).toBe("2027-01-15");
    expect(ajouterMois("2026-01-15", -1)).toBe("2025-12-15");
    expect(ajouterMois("2026-03-31", -1)).toBe("2026-02-28");
    expect(ajouterMois("2026-10-18", 12)).toBe("2027-10-18");
  });

  it("bornes", () => {
    expect(borner("2026-01-01", "2026-06-01", "2026-12-31")).toBe("2026-06-01");
    expect(borner("2027-01-01", "2026-06-01", "2026-12-31")).toBe("2026-12-31");
    expect(borner("2026-07-01", "2026-06-01", "2026-12-31")).toBe("2026-07-01");
    expect(borner("2026-07-01")).toBe("2026-07-01");
  });
});

describe("grilleDuMois", () => {
  it("six semaines pleines qui commencent un lundi", () => {
    const g = grilleDuMois(2026, 10);                        // 1er octobre 2026 = jeudi
    expect(g).toHaveLength(42);
    expect(g[0]).toEqual({ iso: "2026-09-28", jour: 28, dansMois: false });
    expect(g[3]).toEqual({ iso: "2026-10-01", jour: 1, dansMois: true });
    expect(g.filter((c) => c.dansMois)).toHaveLength(31);
    expect(g[41].dansMois).toBe(false);
  });

  it("mois qui commence un lundi : pas de jours du mois precedent en tete", () => {
    const g = grilleDuMois(2026, 6);                         // 1er juin 2026 = lundi
    expect(g[0]).toEqual({ iso: "2026-06-01", jour: 1, dansMois: true });
  });

  it("fevrier bissextile", () => {
    expect(grilleDuMois(2028, 2).filter((c) => c.dansMois)).toHaveLength(29);
  });
});

describe("libelles", () => {
  it("libelle long et pages d'annees", () => {
    expect(libelleLong("2026-10-18")).toBe("18 octobre 2026");
    expect(libelleLong("2026-02-01")).toBe("1er fevrier 2026");
    expect(debutPageAnnees(2026)).toBe(2016);
    expect(debutPageAnnees(2015)).toBe(2004);
  });
});
