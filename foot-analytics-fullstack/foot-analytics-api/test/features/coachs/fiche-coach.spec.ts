import { fonctionsDeBanc, ficheCoach, MatchCoach, ParticipationCoach } from "@/features/coachs/fiche-coach";
import { SaisonRef } from "@/features/joueurs/parcours-joueur";

const s25: SaisonRef = { id: "s25", nom: "2025-2026", anneeDebut: 2025 };
const s26: SaisonRef = { id: "s26", nom: "2026-2027", anneeDebut: 2026 };
const saisons = new Map([s25, s26].map((s) => [s.id, s]));

let n = 0;
/** Participation : le coach est du cote `cote` ; scores vus de la feuille (dom - ext). */
function part(cote: "dom" | "ext", sd: number, se: number, date: string, saisonId: string, extra: Partial<MatchCoach> = {}, fonctions = "E"): ParticipationCoach {
  n++;
  return {
    cote, fonctions,
    match: { id: `m${n}`, date, journee: String(n), saisonId, clubDom: cote === "dom" ? "MON" : "ADV", clubExt: cote === "dom" ? "ADV" : "MON", scoreDom: sd, scoreExt: se, statut: "joue", ...extra },
  };
}

describe("fonctionsDeBanc", () => {
  it("ecarte le delegue de rencontre et les valeurs vides", () => {
    expect(fonctionsDeBanc("E/DR")).toEqual(["E"]);
    expect(fonctionsDeBanc("dr")).toEqual([]);
    expect(fonctionsDeBanc(" a / m ")).toEqual(["A", "M"]);
    expect(fonctionsDeBanc(null)).toEqual([]);
  });
});

describe("ficheCoach", () => {
  it("bilan vu du cote du coach : victoire a domicile, defaite a l'exterieur, nul", () => {
    const f = ficheCoach([part("dom", 2, 0, "07/09/2025", "s25"), part("ext", 3, 1, "14/09/2025", "s25"), part("dom", 1, 1, "21/09/2025", "s25")], saisons);
    expect(f.bilan).toMatchObject({ matchs: 3, v: 1, n: 1, d: 1, bp: 4, bc: 4, pts: 4, ppm: 1.33, pctV: 33 });
  });

  it("matchs non joues, participations sans fonction de banc et matchs sans donnee : ignores", () => {
    const f = ficheCoach([
      part("dom", 0, 0, "25/10/2026", "s26", { statut: "prevu" }),
      part("dom", 2, 0, "07/09/2025", "s25", {}, "DR"),
      { cote: "dom", fonctions: "E", match: null },
      part("dom", 1, 0, "14/09/2025", "s25"),
    ], saisons);
    expect(f.bilan.matchs).toBe(1);
    expect(f.matchs).toHaveLength(1);
  });

  it("matchs du plus recent au plus ancien, par date et non par chaine (2026 avant 2025)", () => {
    const f = ficheCoach([part("dom", 1, 0, "22/11/2025", "s25"), part("dom", 1, 0, "06/09/2026", "s26"), part("dom", 1, 0, "07/09/2025", "s25")], saisons);
    expect(f.matchs.map((m) => m.date)).toEqual(["06/09/2026", "22/11/2025", "07/09/2025"]);
  });

  it("portee d'une saison : bilan et matchs restreints, carriere (par saison et parcours) intacte", () => {
    const parts = [part("dom", 2, 0, "07/09/2025", "s25"), part("dom", 0, 1, "06/09/2026", "s26")];
    const f = ficheCoach(parts, saisons, "s26");
    expect(f.bilan).toMatchObject({ matchs: 1, d: 1 });
    expect(f.matchs).toHaveLength(1);
    expect(f.parSaison.map((s) => [s.saisonNom, s.bilan.matchs])).toEqual([["2026-2027", 1], ["2025-2026", 1]]);
  });

  it("parcours : un coach passe d'un club a l'autre, le plus recent d'abord", () => {
    const ancien = part("dom", 1, 0, "07/09/2025", "s25");
    ancien.match!.clubDom = "MIONS";
    const f = ficheCoach([ancien, part("dom", 1, 0, "14/09/2025", "s25"), part("dom", 1, 0, "06/09/2026", "s26")], saisons);
    expect(f.clubActuelId).toBe("MON");
    expect(f.parcours.map((c) => [c.clubId, c.matchs, c.premierMatch, c.dernierMatch])).toEqual([
      ["MON", 2, "14/09/2025", "06/09/2026"],
      ["MIONS", 1, "07/09/2025", "07/09/2025"],
    ]);
  });

  it("fonction principale : la plus frequente sur la portee", () => {
    const f = ficheCoach([part("dom", 1, 0, "07/09/2025", "s25", {}, "A"), part("dom", 1, 0, "14/09/2025", "s25", {}, "E"), part("dom", 1, 0, "21/09/2025", "s25", {}, "E/DR")], saisons);
    expect(f.fonctionPrincipale).toBe("Entraineur");
    expect(f.fonctions).toEqual([{ code: "E", libelle: "Entraineur", matchs: 2 }, { code: "A", libelle: "Adjoint", matchs: 1 }]);
  });

  it("aucune participation : fiche vide, sans planter", () => {
    const f = ficheCoach([], saisons);
    expect(f).toMatchObject({ bilan: { matchs: 0, ppm: 0, pctV: 0 }, clubActuelId: null, fonctionPrincipale: null, matchs: [], parSaison: [], parcours: [] });
  });
});
