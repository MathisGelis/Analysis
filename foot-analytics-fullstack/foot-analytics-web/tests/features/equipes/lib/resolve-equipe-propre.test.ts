import { describe, expect, it, vi } from "vitest";

// resolve-equipe-propre importe des modules qui lisent les cookies Next : on
// ne teste ici que ses fonctions pures.
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

import { championnatDe, equipeDepuisCookie, equipeParDefaut, resoudreSaison } from "@/features/equipes/lib/resolve-equipe-propre";
import type { Equipe, Saison } from "@/shared/lib/types";

const eq = (id: string, o: Partial<Equipe> = {}): Equipe => ({
  id, clubId: "moi", nom: id, categorie: "Seniors", competitionLibelle: "Seniors D2", poule: "C", saisonId: "s25", ...o,
});
const saisons: Saison[] = [
  { id: "s26", nom: "2026-2027", anneeDebut: 2026, actif: false },
  { id: "s25", nom: "2025-2026", anneeDebut: 2025, actif: true },
];

describe("equipeDepuisCookie", () => {
  const equipes = [eq("a25"), eq("a26", { saisonId: "s26" }), eq("u20-25", { categorie: "U20", competitionLibelle: "U20 R2", poule: "B" })];

  it("cookie sur la saison choisie (ou sans cookie de saison) : l'equipe telle quelle", () => {
    expect(equipeDepuisCookie(equipes, "a25", "s25")?.id).toBe("a25");
    expect(equipeDepuisCookie(equipes, "a25", null)?.id).toBe("a25");
  });
  it("cookie sur une autre saison : l'equivalent sur la saison choisie", () => {
    expect(equipeDepuisCookie(equipes, "a25", "s26")?.id).toBe("a26");
  });
  it("pas d'equivalent, cookie inconnu ou absent : null", () => {
    expect(equipeDepuisCookie(equipes, "u20-25", "s26")).toBeNull();
    expect(equipeDepuisCookie(equipes, "fantome", "s25")).toBeNull();
    expect(equipeDepuisCookie(equipes, null, "s25")).toBeNull();
  });
});

describe("equipeParDefaut", () => {
  const equipes = [eq("seniors"), eq("u20", { categorie: "U20" }), eq("autre", { clubId: "x" })];
  it("l'equipe de mon club la plus active", () => {
    const matchs = [{ equipeDomId: "u20" }, { equipeExtId: "u20" }, { equipeDomId: "seniors" }, { equipeDomId: "autre" }];
    expect(equipeParDefaut(equipes, matchs, "moi", "s25")?.id).toBe("u20");
  });
  it("sans match : premiere equipe du club ; sans equipe sur la saison : null", () => {
    expect(equipeParDefaut(equipes, [], "moi", "s25")?.id).toBe("seniors");
    expect(equipeParDefaut(equipes, [], "moi", "s26")).toBeNull();
  });
});

describe("resoudreSaison", () => {
  it("cookie > saison de l'equipe > saison active > premiere", () => {
    expect(resoudreSaison(saisons, "s26", eq("x"))?.id).toBe("s26");
    expect(resoudreSaison(saisons, null, eq("x", { saisonId: "s26" }))?.id).toBe("s26");
    expect(resoudreSaison(saisons, null, null)?.id).toBe("s25");
    expect(resoudreSaison([saisons[0]], null, null)?.id).toBe("s26");
    expect(resoudreSaison([], null, null)).toBeNull();
  });
});

describe("championnatDe", () => {
  it("ids de toutes les equipes du meme championnat", () => {
    const equipes = [eq("a"), eq("b", { clubId: "x" }), eq("c", { poule: "A" }), eq("d", { saisonId: "s26" })];
    const r = championnatDe(equipes[0], equipes);
    expect([...r.equipesDuChampionnat].sort()).toEqual(["a", "b"]);
    expect(r.championnat).toEqual({ saisonId: "s25", competitionLibelle: "Seniors D2", poule: "C" });
  });
  it("sans equipe : rien", () => {
    expect(championnatDe(null, [])).toEqual({ championnat: null, equipesDuChampionnat: new Set() });
  });
});
