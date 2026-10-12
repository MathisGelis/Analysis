import { describe, expect, it } from "vitest";

import { saisonPassee } from "@/features/joueurs/lib/parcours-joueur";

const saison = (enCours: boolean) => ({ id: "s", nom: "2024-2025", court: "24-25", enCours });

describe("saisonPassee", () => {
  it("affiche la saison courte quand ce n'est pas la saison en cours", () => {
    expect(saisonPassee(saison(false))).toBe("24-25");
  });
  it("saison en cours, inconnue ou absente : rien", () => {
    expect(saisonPassee(saison(true))).toBeNull();
    expect(saisonPassee(null)).toBeNull();
    expect(saisonPassee(undefined)).toBeNull();
  });
});
