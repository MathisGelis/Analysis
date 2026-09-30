import { describe, expect, it } from "vitest";
import { decompteMotifs, liensDeSaison, parsePortee, participationsDeSaison, totauxDepuis } from "./arbitre-portee";

const p = (saisonId: string, o: Record<string, any> = {}) => ({
  saisonId, matchsOfficies: 10, matchsPrincipal: 5, cartonsJaunesDonnes: 20, cartonsRougesDonnes: 1, ...o,
});

describe("parsePortee", () => {
  it("saison par defaut, carriere seulement sur demande explicite", () => {
    expect(parsePortee(undefined)).toBe("saison");
    expect(parsePortee("nimporte")).toBe("saison");
    expect(parsePortee("carriere")).toBe("carriere");
    expect(parsePortee(["carriere", "saison"])).toBe("carriere");
  });
});

describe("filtrage par saison", () => {
  it("participations et liens de la saison uniquement", () => {
    expect(participationsDeSaison([p("s1"), p("s2")], "s2")).toHaveLength(1);
    expect(liensDeSaison([{ matchData: { saisonId: "s1" } }, { matchData: null }], "s1")).toHaveLength(1);
  });
});

describe("totauxDepuis", () => {
  it("somme les championnats, profil du championnat le plus arbitre en principal, note moyenne des liens notes", () => {
    const t = totauxDepuis(
      [p("s1", { matchsPrincipal: 2, profil: "Permissif" }), p("s1", { matchsPrincipal: 9, profil: "Strict", motifsTop: "Antisportif" })],
      [{ note: 6 }, { note: 8 }, { note: null }],
    );
    expect(t).toMatchObject({ matchsOfficies: 20, cartonsJaunesDonnes: 40, cartonsRougesDonnes: 2, noteMoyenne: 7, profil: "Strict", motifsTop: "Antisportif" });
  });
  it("aucune participation : zeros et valeurs nulles", () => {
    expect(totauxDepuis([], [])).toEqual({
      matchsOfficies: 0, cartonsJaunesDonnes: 0, cartonsRougesDonnes: 0, noteMoyenne: null, profil: null, motifsTop: null,
      decompteMotifs: { motifs: [], sansMotif: 0, total: 0 },
    });
  });
});

describe("decompteMotifs", () => {
  const champ = (motifs: { motif: string; n: number }[], sansMotif: number, extra: Record<string, any> = {}) => {
    const total = motifs.reduce((s, m) => s + m.n, 0) + sansMotif;
    return p("s1", { cartonsJaunesDonnes: total, cartonsRougesDonnes: 0, motifs, cartonsSansMotif: sansMotif, ...extra });
  };

  it("additionne les motifs de TOUS les championnats : le total retombe sur les cartons donnes", () => {
    const parts = [
      champ([{ motif: "Comportement antisportif", n: 2 }, { motif: "Retarder la reprise du jeu", n: 1 }], 1),
      champ([{ motif: "comportement antisportif", n: 1 }], 0),
    ];
    const d = decompteMotifs(parts)!;
    expect(d.motifs).toEqual([
      { motif: "Comportement antisportif", n: 3 },
      { motif: "Retarder la reprise du jeu", n: 1 },
    ]);
    expect(d.sansMotif).toBe(1);
    expect(d.total).toBe(5);
    expect(d.total).toBe(parts.reduce((s, x) => s + x.cartonsJaunesDonnes + x.cartonsRougesDonnes, 0));
  });

  it("une participation sans detail (donnees d'avant la mise a jour) : on ne devine pas, null", () => {
    expect(decompteMotifs([champ([{ motif: "A", n: 1 }], 0), p("s1")])).toBeNull();
  });

  it("totauxDepuis expose le decompte avec les motifs de toutes les participations, pas d'un seul championnat", () => {
    const t = totauxDepuis([
      champ([{ motif: "A", n: 2 }], 0, { matchsPrincipal: 9, motifsTop: "A (2)" }),
      champ([{ motif: "B", n: 1 }], 1, { matchsPrincipal: 2, motifsTop: "B (1)" }),
    ], []);
    expect(t.motifsTop).toBe("A (2)");                       // resume : championnat principal
    expect(t.decompteMotifs).toEqual({ motifs: [{ motif: "A", n: 2 }, { motif: "B", n: 1 }], sansMotif: 1, total: 4 });
  });
});
