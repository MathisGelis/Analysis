import { describe, expect, it } from "vitest";

import { cageDesTirs, carteDesTirs, estCadre, filtrerTirs, xgDesTirs } from "@/features/analyse-jeu/lib/tirs-carte";
import { nb, pc, signe, trierJoueursHub } from "@/features/analyse-jeu/lib/format-hub";
import type { TirCarte } from "@/features/analyse-jeu/lib/jeu-types";
import type { DataHubJoueur } from "@/features/analyse-jeu/lib/data-hub-types";

const tir = (resultat: string, extra: Partial<TirCarte> = {}): TirCarte => ({ type: "tir", resultat, minute: 10, tier: 0, couloir: 2, cadre: null, xg: 0.1, ...extra });
const tirs = [
  tir("but", { cadre: 1, xg: 0.2 }), tir("cadre", { cadre: 5 }), tir("arrete", { type: "penalty", cadre: 0, xg: 0.76 }),
  tir("non_cadre", { couloir: 0 }), tir("contre", { tier: 1, couloir: 1 }), tir("poteau", { cadre: 2 }), tir("rate", { type: "penalty", tier: null, couloir: null }),
];

describe("filtres de la carte des tirs", () => {
  it("cadres = buts et tirs arretes (penalty compris) ; non cadres = le reste ; buts", () => {
    expect(filtrerTirs(tirs, "tous")).toHaveLength(7);
    expect(filtrerTirs(tirs, "cadres").map((t) => t.resultat)).toEqual(["but", "cadre", "arrete"]);
    expect(filtrerTirs(tirs, "non_cadres").map((t) => t.resultat)).toEqual(["non_cadre", "contre", "poteau", "rate"]);
    expect(filtrerTirs(tirs, "buts")).toHaveLength(1);
    expect(estCadre({ resultat: "poteau" })).toBe(false);
  });

  it("le filtre ne change pas la liste d'origine, et le nombre de cadres + non cadres fait le total", () => {
    const copie = [...tirs];
    filtrerTirs(tirs, "cadres");
    expect(tirs).toEqual(copie);
    expect(filtrerTirs(tirs, "cadres").length + filtrerTirs(tirs, "non_cadres").length).toBe(tirs.length);
  });
});

describe("carte du terrain et cage", () => {
  it("15 zones tirs et buts, les tirs sans zone comptes a part", () => {
    const c = carteDesTirs(tirs);
    expect(c.tirs).toHaveLength(15);
    expect(c.tirs[2]).toBe(4);               // tiers offensif, centre : but, cadre, arrete, poteau
    expect(c.buts[2]).toBe(1);
    expect(c.tirs[0]).toBe(1);               // offensif gauche
    expect(c.tirs[6]).toBe(1);               // median, axe gauche
    expect(c.sansZone).toBe(1);
  });

  it("la cage : 6 zones, seuls les tirs qui atteignent le cadre (ou le poteau) y figurent ; sans zone de cadre a part", () => {
    const c = cageDesTirs(tirs);
    expect(c.tirs).toEqual([1, 1, 1, 0, 0, 1]);          // penalty arrete (haut gauche), but (haut centre), poteau (haut droit), cadre (bas droit)
    expect(c.buts).toEqual([0, 1, 0, 0, 0, 0]);
    expect(c.sansZone).toBe(0);
    expect(cageDesTirs([tir("cadre"), tir("non_cadre", { cadre: 3 })])).toEqual({ tirs: [0, 0, 0, 0, 0, 0], buts: [0, 0, 0, 0, 0, 0], sansZone: 1 });
  });

  it("xG total arrondi", () => {
    expect(xgDesTirs([tir("but", { xg: 0.123 }), tir("cadre", { xg: 0.456 })])).toBe(0.58);
  });
});

describe("mise en forme du hub", () => {
  it("nombres, pourcentages et ecarts signes", () => {
    expect(nb(null)).toBe("–");
    expect(nb(1.456, 1)).toBe("1,5");
    expect(pc(62)).toBe("62 %");
    expect(pc(null)).toBe("–");
    expect(signe(0.5)).toBe("+0,50");
    expect(signe(-1.2)).toBe("-1,20");
  });

  const j = (nom: string, extra: Partial<DataHubJoueur>): DataHubJoueur => ({
    joueurId: nom, nom, poste: null, minutes: null, noteMoyenne: null, scoreFatigue: null, matchs: 1, buts: 0, passes: 0, passesCles: 0, tirs: 0, cadres: 0, xg: 0, arrets: 0, jaunes: 0, rouges: 0, ...extra,
  });
  it("tri des joueurs : une valeur absente reste en fin de liste dans les deux sens", () => {
    const liste = [j("B", { buts: 2, noteMoyenne: 6 }), j("A", { buts: 5 }), j("C", { buts: 2, noteMoyenne: 7 })];
    expect(trierJoueursHub(liste, "buts", "desc").map((x) => x.nom)).toEqual(["A", "B", "C"]);
    expect(trierJoueursHub(liste, "noteMoyenne", "desc").map((x) => x.nom)).toEqual(["C", "B", "A"]);
    expect(trierJoueursHub(liste, "noteMoyenne", "asc").map((x) => x.nom)).toEqual(["B", "C", "A"]);
    expect(trierJoueursHub(liste, "nom", "asc").map((x) => x.nom)).toEqual(["A", "B", "C"]);
  });
});
