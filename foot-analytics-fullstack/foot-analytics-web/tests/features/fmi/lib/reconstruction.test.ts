import { describe, expect, it } from "vitest";

import { reconstruire, type EtatReconstruction } from "@/features/fmi/lib/reconstruction";

const etat = (statut: EtatReconstruction["statut"], extra: Partial<EtatReconstruction> = {}): EtatReconstruction =>
  ({ id: "t1", statut, resultat: null, erreur: null, ...extra });

describe("reconstruction en tache de fond (suivi)", () => {
  it("lance, relit l'etat jusqu'a la fin et rend le resultat", async () => {
    const lectures = [etat("en_cours"), etat("terminee", { resultat: { joueurs: 30, classement: 12 } })];
    const attentes: number[] = [];
    const r = await reconstruire({
      lancer: async () => etat("en_cours"),
      lire: async (id) => { expect(id).toBe("t1"); return lectures.shift()!; },
      attendre: async (ms) => { attentes.push(ms); },
    });
    expect(r).toEqual({ joueurs: 30, classement: 12 });
    expect(attentes).toEqual([2000, 2000]);
  });

  it("un echec du serveur remonte avec son message", async () => {
    await expect(reconstruire({
      lancer: async () => etat("en_cours"),
      lire: async () => etat("echec", { erreur: "base injoignable" }),
      attendre: async () => {},
    })).rejects.toThrow("base injoignable");
  });

  it("trop long : le suivi s'arrete en le disant (la reconstruction continue sur le serveur)", async () => {
    let t = 0;
    await expect(reconstruire({
      lancer: async () => etat("en_cours"),
      lire: async () => etat("en_cours"),
      attendre: async (ms) => { t += ms; },
      maintenant: () => t,
      delaiMaxMs: 10_000,
    })).rejects.toThrow(/continue sur le serveur/);
  });
});
