import { describe, expect, it } from "vitest";

import { joueursSurTerrain, libellesPostes, ordreTerrain } from "@/features/prematch/lib/onze-terrain";
import type { PosteProbable } from "@/features/prematch/lib/numeros-types";

const poste = (numero: number, nom: string | null, code = "XX"): PosteProbable => ({
  numero, poste: code, joueur: nom, nom, fois: nom ? 3 : 0, origine: nom ? "numero" : null, autres: [],
});
const D433 = [[2, 4, 5, 3], [6, 8, 10], [7, 9, 11]];

describe("onze sur le terrain", () => {
  it("l'ordre du terrain : le gardien, puis chaque ligne du dispositif", () => {
    expect(ordreTerrain(D433)).toEqual([1, 2, 4, 5, 3, 6, 8, 10, 7, 9, 11]);
  });

  it("un joueur par poste dans cet ordre, au nom de famille ; un poste sans joueur reste vide", () => {
    const onze = [poste(1, "Marc ROUX"), poste(2, "Tom LEBLANC"), poste(5, "Jason BOURGEOIS BIDDI"), poste(9, null), poste(10, "Mael MOREAU")];
    const j = joueursSurTerrain(onze, D433);
    expect(j).toHaveLength(11);
    expect(j[0]).toEqual({ numero: 1, nom: "ROUX" });
    expect(j[1]).toEqual({ numero: 2, nom: "LEBLANC" });
    expect(j[3]).toEqual({ numero: 5, nom: "BOURGEOIS BIDDI" });
    expect(j[2]).toBeNull();                        // le 4 : personne
    expect(j[9]).toBeNull();                        // le 9 : poste sans nom
    expect(j[7]).toEqual({ numero: 10, nom: "MOREAU" });
  });

  it("les libelles des postes dans le meme ordre (le numero quand le poste est inconnu)", () => {
    const l = libellesPostes([poste(1, "A", "GB"), poste(4, null, "DCD")], [[2, 4, 5, 3]]);
    expect(l).toEqual(["GB", "2", "DCD", "5", "3"]);
  });
});
