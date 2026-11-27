import { unzipSync, strFromU8 } from "fflate";

import { construireRapportApresMatch, ContenuApresMatch } from "@/features/analyse-jeu/rapport-apres-match";
import { resumerMatch } from "@/features/analyse-jeu/stats-jeu";

const ev = (e: object) => ({ cote: "dom" as const, minute: 10, ...e }) as any;
const evenements = [
  ev({ type: "tir", resultat: "but", minute: 20, zoneTier: 0, zoneCouloir: 2, zoneCadre: 1 }), ev({ type: "tir", resultat: "non_cadre", minute: 50, zoneTier: 1, zoneCouloir: 0 }),
  ev({ cote: "ext", type: "tir", resultat: "cadre", minute: 70, zoneTier: 0, zoneCouloir: 3 }),
];
const contenu = (extra: Partial<ContenuApresMatch> = {}): ContenuApresMatch => ({
  nomNous: "FC Exemple", nomEux: "AS Voisins", date: "2026-05-30", competition: "Seniors D2", journee: "J12",
  resume: resumerMatch({ nousCote: "dom", evenements, fmi: [], scoreDom: 1, scoreExt: 0, scoreOfficiel: true }),
  compo: { formation: "4-1-2-1-2", titulaires: [{ numero: 1, nom: "Roche" }, { numero: 9, nom: "Dumas" }] },
  mouvements: [{ minute: "46", texte: "14 Roux remplace 7 Faure" }, { minute: "64", texte: "Système : 4-4-2 losange" }],
  bilan: { positifs: "Pressing haut", aTravailler: "Coups de pied arrêtés", bilan: null }, ...extra,
});
const texte = (octets: Uint8Array) => {
  const f = unzipSync(octets);
  return Object.entries(f).filter(([nom]) => /^ppt\/slides\/slide\d+\.xml$/.test(nom)).map(([, d]) => strFromU8(d)).join(" ");
};

describe("rapport d'apres-match (PowerPoint)", () => {
  it("un vrai fichier .pptx avec le score, les stats, la compo en 4-4-2 losange, les mouvements et le bilan", async () => {
    const octets = await construireRapportApresMatch(contenu());
    expect(octets[0]).toBe(0x50);                                                // un zip (« PK »)
    const t = texte(octets);
    expect(t).toContain("FC Exemple");
    expect(t).toContain("1 – 0");
    expect(t).toContain("Statistiques du match");
    expect(t).toContain("Compo de départ · 4-4-2 losange");
    expect(t).not.toContain("4-1-2-1-2");
    expect(t).toContain("Système : 4-4-2 losange");
    expect(t).toContain("14 Roux remplace 7 Faure");
    expect(t).toContain("Pressing haut");
  });

  it("une section sans donnee n'est pas fabriquee (ni compo, ni bilan, ni carte des tirs)", async () => {
    const vide = contenu({ compo: null, mouvements: [], bilan: null, resume: resumerMatch({ nousCote: "dom", evenements: [], fmi: [], scoreDom: 2, scoreExt: 2, scoreOfficiel: true }) });
    const t = texte(await construireRapportApresMatch(vide));
    expect(t).not.toContain("Compo de départ");
    expect(t).not.toContain("Bilan de l");
    expect(t).not.toContain("Nos tirs");
    expect(t).toContain("2 – 2");
  });
});
