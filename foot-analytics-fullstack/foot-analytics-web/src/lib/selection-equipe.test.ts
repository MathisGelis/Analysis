import { describe, expect, it } from "vitest";
import { selectionValide } from "./selection-equipe";
import type { Equipe, Saison } from "./types";

const saison = (id: string, anneeDebut: number, actif = false): Saison => ({ id, nom: id, anneeDebut, actif });
const eq = (id: string, saisonId: string | null, categorie = "Seniors", poule: string | null = null): Equipe =>
  ({ id, clubId: "c", nom: id, saisonId, categorie, poule, competitionLibelle: "D2" });

const saisons = [saison("s24", 2024), saison("s25", 2025), saison("s26", 2026, true)];
const equipes = [eq("sen24", "s24"), eq("u20-25", "s25", "U20"), eq("sen25", "s25"), eq("sen26", "s26", "Seniors", "A")];

describe("selectionValide", () => {
  it("cookies coherents : rien a corriger", () => {
    expect(selectionValide({ equipes, saisons, equipeId: "sen25", saisonId: "s25" }))
      .toEqual({ equipe: equipes[2], saisonId: "s25", corrigee: false });
  });

  it("equipe du cookie SUPPRIMEE (fusionnee avec la vraie poule) : jamais vide, retombe sur la saison choisie", () => {
    const r = selectionValide({ equipes, saisons, equipeId: "provisoire-poule-C", saisonId: "s26" });
    expect(r.equipe?.id).toBe("sen26");
    expect(r).toMatchObject({ saisonId: "s26", corrigee: true });
  });

  it("equipe supprimee : garde la categorie quand c'est possible (l'equivalent d'abord)", () => {
    // Pas d'equipe supprimee connue ici : on prend la premiere de la saison.
    expect(selectionValide({ equipes, saisons, equipeId: "fantome", saisonId: "s25" }).equipe?.id).toBe("u20-25");
  });

  it("equipe d'une autre saison que celle choisie : son equivalent sur la saison choisie", () => {
    const r = selectionValide({ equipes, saisons, equipeId: "sen25", saisonId: "s26" });
    expect(r).toMatchObject({ equipe: { id: "sen26" }, saisonId: "s26", corrigee: true });
    const u20 = selectionValide({ equipes, saisons, equipeId: "u20-25", saisonId: "s24" });
    expect(u20.equipe?.id).toBe("sen24");   // pas d'U20 en 24-25 : premiere equipe de la saison
  });

  it("saison choisie SANS equipe pour le club : garde l'equipe et sa saison plutot que du vide", () => {
    const sansEquipe = [...saisons, saison("s27", 2027)];
    const r = selectionValide({ equipes, saisons: sansEquipe, equipeId: "sen26", saisonId: "s27" });
    expect(r).toMatchObject({ equipe: { id: "sen26" }, saisonId: "s26", corrigee: true });
  });

  it("aucun cookie : premiere equipe de la saison active", () => {
    expect(selectionValide({ equipes, saisons })).toMatchObject({ equipe: { id: "sen26" }, saisonId: "s26", corrigee: true });
  });

  it("saison active sans equipe : la saison la plus recente qui en a", () => {
    const r = selectionValide({ equipes: equipes.filter((e) => e.saisonId !== "s26"), saisons });
    expect(r).toMatchObject({ equipe: { id: "u20-25" }, saisonId: "s25" });
  });

  it("saison du cookie inconnue (supprimee) : ignoree", () => {
    const r = selectionValide({ equipes, saisons, equipeId: "sen25", saisonId: "supprimee" });
    expect(r).toMatchObject({ equipe: { id: "sen25" }, saisonId: "s25", corrigee: true });
  });

  it("equipes sans saison : n'importe quelle equipe du club", () => {
    const r = selectionValide({ equipes: [eq("x", null)], saisons: [] });
    expect(r.equipe?.id).toBe("x");
  });

  it("club sans aucune equipe : la seule situation ou la selection est vide", () => {
    expect(selectionValide({ equipes: [], saisons, equipeId: "sen25", saisonId: "s25" }))
      .toEqual({ equipe: null, saisonId: "s25", corrigee: true });
  });
});
