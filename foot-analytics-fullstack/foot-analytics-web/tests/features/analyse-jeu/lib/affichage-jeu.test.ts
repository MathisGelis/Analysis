import { describe, expect, it } from "vitest";

import { intensite, libelleScore, partDe, phraseTranches } from "@/features/analyse-jeu/lib/affichage-jeu";

describe("analyse du jeu : affichage", () => {
  it("part d'une barre ; 50 % quand rien n'est compté", () => {
    expect(partDe(3, 1)).toBe(75);
    expect(partDe(0, 4)).toBe(0);
    expect(partDe(0, 0)).toBe(50);
  });
  it("intensité d'une zone rapportée au maximum de la carte", () => {
    expect(intensite(3, [3, 1, 0])).toBe(1);
    expect(intensite(1, [3, 1, 0])).toBeCloseTo(1 / 3);
    expect(intensite(0, [0, 0])).toBe(0);
  });
  it("phrase des buts par tranche", () => {
    expect(phraseTranches([{ nom: "0-15", nous: 1, eux: 0 }, { nom: "15-30", nous: 0, eux: 2 }])).toBe("Buts par tranche de 15 minutes. 0-15 minutes : 1 but pour nous, 0 pour eux ; 15-30 minutes : 0 but pour nous, 2 pour eux.");
    expect(phraseTranches([{ nom: "0-15", nous: 0, eux: 0 }])).toBe("Aucun but dans le match.");
  });
  it("score lu à voix haute", () => { expect(libelleScore({ nous: 2, eux: 1 })).toBe("2 à 1"); });
});
