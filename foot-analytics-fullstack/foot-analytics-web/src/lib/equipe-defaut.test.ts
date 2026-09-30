import { describe, expect, it } from "vitest";
import { choisirEquipeParDefaut } from "./equipe-defaut";
import type { Equipe, Saison } from "./types";

const saison = (id: string, actif = false): Saison => ({ id, nom: id, anneeDebut: 2025, actif });
const eq = (id: string, saisonId: string | null): Equipe => ({ id, clubId: "c", nom: id, saisonId });

describe("choisirEquipeParDefaut", () => {
  const saisons = [saison("s26"), saison("s25", true)];

  it("aucune equipe et aucune saison choisie : null", () => {
    expect(choisirEquipeParDefaut([], saisons)).toBeNull();
  });
  it("premiere equipe de la saison active", () => {
    const r = choisirEquipeParDefaut([eq("a26", "s26"), eq("a25", "s25")], saisons);
    expect(r).toMatchObject({ equipe: { id: "a25" }, saisonId: "s25" });
  });
  it("saison active sans equipe : n'importe quelle equipe du club", () => {
    expect(choisirEquipeParDefaut([eq("a26", "s26")], saisons)?.equipe?.id).toBe("a26");
  });
  it("respecte la saison deja choisie et ne bascule jamais dessus, meme sans equipe", () => {
    const r = choisirEquipeParDefaut([eq("a25", "s25")], saisons, "s26");
    expect(r).toEqual({ equipe: null, saisonId: "s26" });
  });
  it("saison choisie inconnue : retombe sur la saison active", () => {
    expect(choisirEquipeParDefaut([eq("a25", "s25")], saisons, "fantome")?.equipe?.id).toBe("a25");
  });
});
