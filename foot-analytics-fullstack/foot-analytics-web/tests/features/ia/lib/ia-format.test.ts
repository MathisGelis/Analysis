import { describe, expect, it } from "vitest";

import {
  bornesCourbe, coupuresDeCourbe, dateDeSemaine, dateHeure, dernierReussi, dureeFr, ecartPoints, echelleDePoids, libelleHyper, lignesDePoids, meilleureReference, moisCourt, nombre, pct,
  semainesNotees, sensDuPoids, serieCourbe, texteFauxPositifs, texteManques, verdict,
} from "@/features/ia/lib/ia-format";
import type { Caracteristique, EntrainementResume, ErreurFeuille, NotesParMethode, PointCourbe } from "@/features/ia/lib/ia-types";

const note = (onze: number | null, postes: number | null = null) => ({ n: onze === null ? 0 : 100, onze, postes, nPostes: postes === null ? 0 : 100, parfaits: 3 });
const notes = (modele: number | null, dernier: number | null, moteur: number | null, frequence: number | null): NotesParMethode => ({
  modele: note(modele), dernier: note(dernier), moteur: note(moteur), frequence: note(frequence),
});

describe("nombres", () => {
  it("pct : virgule francaise, decimales au choix, absent -> tiret", () => {
    expect(pct(0.8412).replace(/\s/g, " ")).toBe("84,1 %");
    expect(pct(0.8412, 0).replace(/\s/g, " ")).toBe("84 %");
    expect(pct(1).replace(/\s/g, " ")).toBe("100,0 %");
    expect(pct(null)).toBe("—");
    expect(pct(undefined)).toBe("—");
  });

  it("ecartPoints : signe, virgule, pluriel a partir de 2", () => {
    expect(ecartPoints(0.845, 0.838)).toBe("+0,7 pt");
    expect(ecartPoints(0.80, 0.838)).toBe("-3,8 pts");
    expect(ecartPoints(0.84, 0.84)).toBe("0,0 pt");
    expect(ecartPoints(0.8402, 0.84)).toBe("0,0 pt");
    expect(ecartPoints(null, 0.8)).toBe("—");
  });

  it("nombre", () => {
    expect(nombre(0.5617, 3)).toBe("0,562");
    expect(nombre(null)).toBe("—");
  });

  it("dureeFr", () => {
    expect(dureeFr(4_200)).toBe("4 s");
    expect(dureeFr(72_000)).toBe("1 min 12 s");
    expect(dureeFr(125 * 60_000 + 5_000)).toBe("2 h 05 min");
  });

  it("dateHeure : horodatage ISO, ou tiret", () => {
    expect(dateHeure("2026-10-05T14:32:00.000Z")).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
    expect(dateHeure(null)).toBe("—");
    expect(dateHeure("pas une date")).toBe("—");
  });

  it("libelleHyper", () => {
    expect(libelleHyper({ fenetre: 10, l2: 0.3, demiVie: null })).toBe("fenetre de 10 matchs, regularisation 0,3");
    expect(libelleHyper({ fenetre: 6, l2: 3, demiVie: 12 })).toBe("fenetre de 6 matchs, regularisation 3, oubli en 12 semaines");
  });
});

describe("meilleureReference et verdict", () => {
  it("la meilleure reference est celle du onze le plus haut, hors modele", () => {
    expect(meilleureReference(notes(0.9, 0.8, 0.84, 0.82))).toEqual({ methode: "moteur", onze: 0.84 });
    expect(meilleureReference(notes(0.9, 0.8, null, 0.82))).toEqual({ methode: "frequence", onze: 0.82 });
    expect(meilleureReference(notes(0.9, null, null, null))).toBeNull();
  });

  it("verdict : mieux, a egalite, ou moins bien que le meilleur repere, sur les dernieres semaines", () => {
    const g = notes(0.7, 0.7, 0.7, 0.7);
    expect(verdict({ global: g, recent: notes(0.86, 0.8, 0.84, 0.82) })).toMatchObject({ ton: "bon", texte: expect.stringContaining("+2,0 pts") });
    expect(verdict({ global: g, recent: notes(0.845, 0.8, 0.84, 0.82) }).ton).toBe("neutre");
    const mauvais = verdict({ global: g, recent: notes(0.78, 0.8, 0.84, 0.82) });
    expect(mauvais.ton).toBe("mauvais");
    expect(mauvais.texte).toMatch(/ne l'activez pas/);
    expect(verdict({ global: notes(null, null, null, null), recent: notes(null, null, null, null) }).ton).toBe("neutre");
  });

  it("verdict : sans dernieres semaines (peu de donnees), il juge sur toute la periode", () => {
    const vide = notes(null, null, null, null);
    expect(verdict({ global: notes(0.9, 0.8, 0.8, 0.8), recent: vide }).ton).toBe("bon");
  });
});

describe("courbe", () => {
  const point = (etape: number, n: number, modele: number | null): PointCourbe => ({
    etape, libelle: `S${etape}`, journees: "", n,
    modele: { onze: modele, postes: modele === null ? null : Math.round((modele - 0.05) * 100) / 100 }, dernier: { onze: 0.7, postes: null }, moteur: { onze: 0.8, postes: 0.7 }, frequence: { onze: 0.75, postes: null }, perte: null,
  });
  const courbe = [point(0, 0, null), point(1, 8, 0.8), point(2, 8, 0.85)];

  it("serieCourbe : les valeurs d'une methode et d'une mesure, null conserve", () => {
    expect(serieCourbe(courbe, "modele", "onze")).toEqual([null, 0.8, 0.85]);
    expect(serieCourbe(courbe, "modele", "postes")).toEqual([null, 0.75, 0.8]);
    expect(serieCourbe(courbe, "dernier", "postes")).toEqual([null, null, null]);
  });

  it("semainesNotees : sans la premiere semaine (aucune prediction possible)", () => {
    expect(semainesNotees(courbe).map((p) => p.etape)).toEqual([1, 2]);
  });

  it("bornesCourbe : au dixieme, jamais hors de 0 a 1, au moins deux dixiemes de haut", () => {
    expect(bornesCourbe([0.62, 0.9, null])).toEqual({ min: 0.5, max: 1 });
    expect(bornesCourbe([0.5, 0.52])).toEqual({ min: 0.4, max: 0.6 });
    expect(bornesCourbe([null, null])).toEqual({ min: 0, max: 1 });
    expect(bornesCourbe([0.99, 1])).toEqual({ min: 0.8, max: 1 });
    expect(bornesCourbe([0, 0.1])).toEqual({ min: 0, max: 0.2 });
  });
});

describe("axe de la courbe", () => {
  it("dateDeSemaine et moisCourt : la date du libelle, le mois en ASCII et l'annee sur deux chiffres", () => {
    expect(dateDeSemaine("Semaine du 08/12/2025")).toBe(Date.UTC(2025, 11, 8));
    expect(dateDeSemaine("sans date")).toBeNull();
    expect(moisCourt("Semaine du 08/12/2025")).toBe("dec. 25");
    expect(moisCourt("Semaine du 01/09/2024")).toBe("sept. 24");
    expect(moisCourt("Semaine du 03/02/2026")).toBe("fevr. 26");
    expect(moisCourt("sans date")).toBe("sans date");
  });

  it("coupuresDeCourbe : l'indice de la premiere semaine apres plus de 45 jours sans match (l'inter-saison)", () => {
    const sem = (d: string) => ({ libelle: `Semaine du ${d}` });
    const courbe = [sem("01/09/2025"), sem("08/09/2025"), sem("15/09/2025"), sem("11/05/2026"), sem("07/09/2026"), sem("14/09/2026")];
    expect(coupuresDeCourbe(courbe)).toEqual([3, 4]);
    expect(coupuresDeCourbe(courbe, 300)).toEqual([]);
    expect(coupuresDeCourbe([sem("01/09/2025")])).toEqual([]);
    expect(coupuresDeCourbe([{ libelle: "x" }, { libelle: "y" }])).toEqual([]);
  });
});

describe("poids appris", () => {
  const catalogue: Caracteristique[] = [
    { id: "biais", libelle: "Point de depart", aide: "x" },
    { id: "taux", libelle: "Taux", aide: "y" },
    { id: "absent", libelle: "Absent", aide: "z" },
  ];

  it("sensDuPoids : favorise, defavorise ou neutre", () => {
    expect(sensDuPoids(1.2)).toBe("favorise");
    expect(sensDuPoids(-0.4)).toBe("defavorise");
    expect(sensDuPoids(0.1)).toBe("neutre");
    expect(sensDuPoids(-0.15)).toBe("neutre");
  });

  it("lignesDePoids : libelle, valeur apprise, valeur de depart et variation, dans l'ordre du catalogue", () => {
    const l = lignesDePoids(catalogue, { noms: ["taux", "biais"], w: [2.5, -3] }, { noms: ["biais", "taux"], w: [-3.5, 4] });
    expect(l.map((x) => x.id)).toEqual(["biais", "taux", "absent"]);
    expect(l[0]).toMatchObject({ libelle: "Point de depart", appris: -3, depart: -3.5, variation: 0.5, sens: "defavorise" });
    expect(l[1]).toMatchObject({ appris: 2.5, depart: 4, variation: -1.5, sens: "favorise" });
    expect(l[2]).toMatchObject({ appris: 0, depart: 0, variation: 0, sens: "neutre" });      // poids absent : zero
    expect(lignesDePoids(catalogue, null, null)).toEqual([]);
  });

  it("echelleDePoids : au moins 1, sinon la plus grande valeur absolue (appris ou de depart)", () => {
    const l = lignesDePoids(catalogue, { noms: ["biais", "taux", "absent"], w: [0.2, -5.5, 1] }, { noms: ["biais", "taux", "absent"], w: [0, 4, 0] });
    expect(echelleDePoids(l)).toBe(5.5);
    expect(echelleDePoids([])).toBe(1);
  });
});

describe("erreurs", () => {
  const e: ErreurFeuille = {
    matchId: "m", etape: 3, date: "14/09/2025", journee: "2", equipe: "Club A Seniors", adversaire: "Club B", domicile: true, onze: 0.6,
    manques: [{ nom: "Jean DUPONT", proba: 0.12 }, { nom: "Nouveau GB", proba: null }],
    fauxPositifs: [{ nom: "Paul MARTIN", proba: 0.84 }],
  };

  it("manques : ce que le modele n'avait pas vu venir, avec sa probabilite ou 'inconnu de l'equipe'", () => {
    expect(texteManques(e).replace(/\s/g, " ")).toBe("Jean DUPONT (12 %), Nouveau GB (inconnu de l'equipe)");
  });

  it("faux positifs : ceux annonces a tort", () => {
    expect(texteFauxPositifs(e).replace(/\s/g, " ")).toBe("Paul MARTIN (84 %)");
  });
});

describe("dernierReussi", () => {
  const run = (id: string, statut: EntrainementResume["statut"], modele: boolean): EntrainementResume => ({
    id, statut, progression: 100, message: null, options: { optimiser: true, saisonIds: null }, lancePar: null, modeleId: modele ? `m-${id}` : null,
    termineLe: null, creeLe: "2026-10-05T10:00:00.000Z", declencheur: "manuel", decision: null,
    modele: modele ? { id: `m-${id}`, nom: "Modele", actif: false, resume: {} as never } : null,
  });

  it("le premier entrainement termine qui a un modele (la liste est du plus recent au plus ancien)", () => {
    expect(dernierReussi([run("a", "echec", false), run("b", "termine", true), run("c", "termine", true)])?.id).toBe("b");
    expect(dernierReussi([run("a", "annule", false)])).toBeNull();
    expect(dernierReussi([])).toBeNull();
  });
});
