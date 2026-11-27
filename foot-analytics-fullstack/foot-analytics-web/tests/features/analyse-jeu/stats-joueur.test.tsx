import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LieuMatch } from "@/features/analyse-jeu/components/LieuMatch";
import type { RangEffectif, StatsJoueurDirect } from "@/features/analyse-jeu/lib/data-hub-types";
import { famillePoste, formeRecente, ordinal, par90, rangsAffiches, sectionsPour } from "@/features/analyse-jeu/lib/stats-joueur";

const rang = (cle: RangEffectif["cle"]): RangEffectif => ({ cle, libelle: cle, valeur: 3, rang: 1, sur: 12 }) as RangEffectif;
const match = (i: number, buts: number, arrets = 0): StatsJoueurDirect["parMatch"][number] => ({
  matchId: `m${i}`, date: `2025-10-${String(i).padStart(2, "0")}`, adversaire: "X", domicile: true, bp: 1, bc: 0, buts, passes: 0, tirs: buts, xg: 0.5, fautes: 0, jaunes: 0, rouges: 0,
  minutes: 90, titulaire: true, passesCles: 0, butsEncaisses: 0, arrets,
}) as StatsJoueurDirect["parMatch"][number];

describe("famillePoste", () => {
  it("prend le poste de la fiche, sinon le numéro le plus porté", () => {
    expect(famillePoste("GB", 5)).toBe("gardien");
    expect(famillePoste("DC", null)).toBe("defenseur");
    expect(famillePoste("MO", null)).toBe("milieu");
    expect(famillePoste("AD", null)).toBe("attaquant");
    expect(famillePoste(null, 1)).toBe("gardien");
    expect(famillePoste(null, 9)).toBe("attaquant");
    expect(famillePoste(null, null)).toBe("inconnue");
  });
});

describe("blocs par poste", () => {
  it("un gardien n'a pas de finition, un joueur de champ pas de bloc gardien", () => {
    expect(sectionsPour("gardien", { tirs: 0 })).not.toContain("finition");
    expect(sectionsPour("gardien", { tirs: 0 })).toContain("creation");
    for (const f of ["defenseur", "milieu", "attaquant", "inconnue"] as const) expect(sectionsPour(f, { tirs: 2 })).not.toContain("gardien");
  });
  it("les rangs : arrêts réservés au gardien, passes clés pour tous", () => {
    const tous = [rang("buts"), rang("passesCles"), rang("arrets"), rang("tirs")];
    expect(rangsAffiches(tous, "gardien").map((r) => r.cle)).toEqual(["passesCles", "arrets"]);
    expect(rangsAffiches(tous, "milieu").map((r) => r.cle)).toEqual(["buts", "passesCles", "tirs"]);
  });
});

describe("par 90, ordinal, forme", () => {
  it("rapporte à 90 minutes", () => {
    expect(par90(2, 180)).toBe(1);
    expect(par90(1, null)).toBeNull();
    expect(par90(1, 0)).toBeNull();
  });
  it("ordinal", () => { expect(ordinal(1)).toBe("1er"); expect(ordinal(3)).toBe("3e"); });
  it("compare les 5 derniers matchs à la saison", () => {
    const f = formeRecente([1, 2, 3, 4, 5, 6, 7].map((i) => match(i, i > 2 ? 1 : 0)), "attaquant");
    expect(f.recents).toBe(5);
    const buts = f.lignes.find((l) => l.cle === "buts")!;
    expect(buts.recent).toBe(1);
    expect(buts.saison).toBeCloseTo(0.71, 2);
    expect(formeRecente([match(1, 1)], "gardien").lignes.map((l) => l.cle)).toEqual(["arrets", "encaisses", "pc"]);
  });
});

describe("LieuMatch", () => {
  it("affiche Dom. / Ext. et jamais « @ »", () => {
    expect(renderToStaticMarkup(<LieuMatch domicile />)).toContain("Dom.");
    const ext = renderToStaticMarkup(<LieuMatch domicile={false} />);
    expect(ext).toContain("Ext.");
    expect(ext).not.toContain("@");
  });
});
