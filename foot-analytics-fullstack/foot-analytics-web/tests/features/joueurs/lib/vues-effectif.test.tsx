import { describe, expect, it } from "vitest";

import { COLONNES } from "@/features/joueurs/components/colonnes-effectif";
import { COLONNES_VUE, VUES_EFFECTIF, ageAu, lireVue, parMatch } from "@/features/joueurs/lib/vues-effectif";
import { trierEffectif } from "@/features/joueurs/lib/tri-effectif";
import type { Joueur } from "@/shared/lib/types";

describe("vues de l'effectif", () => {
  it("chaque vue n'utilise que des colonnes qui existent, sans doublon", () => {
    for (const v of VUES_EFFECTIF) {
      const ids = COLONNES_VUE[v.id];
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(COLONNES[id], `${v.id} → ${id}`).toBeDefined();
    }
  });

  it("une vue inconnue ou absente retombe sur Général", () => {
    expect(lireVue("medical")).toBe("medical");
    expect(lireVue("n'importe quoi")).toBe("general");
    expect(lireVue(null)).toBe("general");
  });

  it("âge : formats jj/mm/aaaa et ISO, anniversaire pas encore passé, date illisible", () => {
    const jour = new Date(2026, 9, 14);
    expect(ageAu("14/10/2000", jour)).toBe(26);
    expect(ageAu("15/10/2000", jour)).toBe(25);
    expect(ageAu("2000-10-14", jour)).toBe(26);
    expect(ageAu("n'importe quoi", jour)).toBeNull();
    expect(ageAu(undefined, jour)).toBeNull();
  });

  it("par match : arrondi à 2 décimales, null sans match", () => {
    expect(parMatch(5, 3)).toBe(1.67);
    expect(parMatch(5, 0)).toBeNull();
  });

  it("tri sur les nouvelles colonnes : la donnée manquante reste en fin de liste", () => {
    const j = (nom: string, acwr?: number) => ({ id: nom, nom, prenom: "", clubId: "c", matchs: 0, titularisations: 0, minutes: 0, cartonsJaunes: 0, cartonsRouges: 0, acwr }) as Joueur;
    const liste = [j("B"), j("A", 1.4), j("C", 0.9)];
    expect(trierEffectif(liste, "acwr", "desc").map((x) => x.nom)).toEqual(["A", "C", "B"]);
    expect(trierEffectif(liste, "acwr", "asc").map((x) => x.nom)).toEqual(["C", "A", "B"]);
  });
});
