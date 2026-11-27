import { bilanMiTemps, EvenementMiTemps } from "@/features/analyse-jeu/bilan-mi-temps";

const ev = (e: Partial<EvenementMiTemps>): EvenementMiTemps => ({ cote: "dom", type: "tir", minute: 10, periode: 1, ...e }) as EvenementMiTemps;
// Un tir adverse (cote ext) cadre depuis notre gauche (leur couloir 4 = notre couloir 0) dans leur tiers offensif.
const tirAdv = (m: number, extra: object = {}) => ev({ cote: "ext", type: "tir", resultat: "cadre", minute: m, zoneTier: 0, zoneCouloir: 4, ...extra });

describe("bilan de mi-temps", () => {
  it("sans evenement de premiere periode : rien a bilanter", () => {
    expect(bilanMiTemps({ nousCote: "dom", evenements: [] }).disponible).toBe(false);
    expect(bilanMiTemps({ nousCote: "dom", evenements: [ev({ periode: 2 })] }).disponible).toBe(false);
  });

  it("chiffres de la premiere periode seulement, score et lignes pour nous / eux", () => {
    const b = bilanMiTemps({ nousCote: "dom", evenements: [
      ev({ resultat: "but", zoneTier: 0, zoneCouloir: 2 }), ev({ resultat: "cadre", zoneTier: 0, zoneCouloir: 2, minute: 20 }), ev({ cote: "ext", resultat: "non_cadre", minute: 30 }),
      ev({ resultat: "but", periode: 2, minute: 60 }),
    ] });
    expect(b.disponible).toBe(true);
    expect(b.score).toEqual({ nous: 1, eux: 0 });
    expect(b.lignes.find((l) => l.cle === "tirs")).toMatchObject({ nous: 2, eux: 1 });
    expect(b.lignes.find((l) => l.cle === "xg")!.nous).toBeGreaterThan(0);
  });

  it("l'adversaire passe toujours par le meme couloir : on le dit, avec la piste", () => {
    const b = bilanMiTemps({ nousCote: "dom", evenements: [5, 8, 12, 15, 20, 24, 28, 32].map((m) => tirAdv(m, { contextes: ["Attaque placée"] })) });
    expect(b.couloirConcede).toMatchObject({ nom: "gauche" });
    expect(b.pistes.map((p) => p.titre)).toEqual(expect.arrayContaining([expect.stringContaining("notre côté gauche")]));
    expect(b.pistes.some((p) => p.titre.includes("plus de danger") && p.ton === "alerte")).toBe(true);
  });

  it("joueurs a suivre : fautifs et avertis ; trop de fautes et jaunes remontent une alerte", () => {
    const evs = [
      ...[1, 2, 3].map((i) => ev({ type: "faute", minute: i, joueurNumero: 4, joueurNom: "Defenseur" })),
      ev({ type: "carton_jaune", minute: 8, joueurNumero: 4, joueurNom: "Defenseur" }), ev({ type: "carton_jaune", minute: 9, joueurNumero: 8, joueurNom: "Milieu" }),
      ev({ resultat: "but", minute: 25, joueurNumero: 9, joueurNom: "Avant" }),
    ];
    const b = bilanMiTemps({ nousCote: "dom", evenements: evs });
    expect(b.joueurs.map((j) => j.numero)).toEqual([4, 8, 9]);          // le plus averti d'abord, le buteur ensuite
    expect(b.joueurs[0]).toMatchObject({ fautes: 3, jaunes: 1 });
    expect(b.pistes.some((p) => p.titre === "Trop de fautes")).toBe(true);
  });

  it("un rouge de chaque cote donne la bonne piste", () => {
    expect(bilanMiTemps({ nousCote: "dom", evenements: [ev({ type: "carton_rouge", joueurNumero: 6 })] }).pistes.map((p) => p.titre)).toContain("On joue à 10");
    expect(bilanMiTemps({ nousCote: "dom", evenements: [ev({ cote: "ext", type: "carton_rouge" })] }).pistes.map((p) => p.titre)).toContain("L'adversaire joue à 10");
  });

  it("beaucoup de tirs sans but : patience et qualite", () => {
    const evs = Array.from({ length: 7 }, (_, i) => ev({ resultat: "non_cadre", minute: i + 1, zoneTier: 0, zoneCouloir: 2 }));
    expect(bilanMiTemps({ nousCote: "dom", evenements: evs }).pistes.some((p) => p.titre === "Beaucoup de tirs, pas de but")).toBe(true);
  });
});
