import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CarteTirs } from "@/features/analyse-jeu/components/CarteTirs";
import type { TirCarte } from "@/features/analyse-jeu/lib/jeu-types";

const tir = (resultat: string, extra: Partial<TirCarte> = {}): TirCarte => ({ type: "tir", resultat, minute: 10, tier: 0, couloir: 2, cadre: 1, xg: 0.1, ...extra });

describe("CarteTirs", () => {
  it("propose les filtres, la carte du terrain et la cage, avec le xG estime", () => {
    const html = renderToStaticMarkup(<CarteTirs nous={[tir("but"), tir("cadre", { cadre: 5 }), tir("non_cadre", { cadre: null })]} eux={[tir("but")]} />);
    for (const libelle of ["Tous", "Cadrés", "Non cadrés", "Buts", "Nous", "Adversaire", "Dans la cage"]) expect(html).toContain(libelle);
    expect(html).toContain("3 tirs");
    expect(html).toContain("xG estimé 0.30");
    expect(html).toContain("Cage haut centre");
  });

  it("sans tir de l'adversaire, pas de choix d'equipe ; sans aucun tir, un message", () => {
    expect(renderToStaticMarkup(<CarteTirs nous={[tir("but")]} />)).not.toContain("Adversaire");
    expect(renderToStaticMarkup(<CarteTirs nous={[]} />)).toContain("Aucun tir ne correspond");
  });
});
