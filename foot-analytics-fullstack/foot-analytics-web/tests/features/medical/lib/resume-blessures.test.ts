import { describe, expect, it } from "vitest";

import {
  blessuresDeLaSaison, type BlessureSaison, fenetreSaison, joursDansLaSaison, lireJour, resumerBlessures,
} from "@/features/medical/lib/resume-blessures";

const jour = (a: number, m: number, j: number) => Date.UTC(a, m - 1, j);
const b = (id: string, joueurId: string, extra: Partial<BlessureSaison> = {}): BlessureSaison => ({ id, joueurId, joueurNom: `Joueur ${joueurId}`, ...extra });
const NOW = jour(2026, 3, 1);

describe("lireJour", () => {
  it("ISO (avec ou sans heure) et JJ/MM/AAAA, en UTC ; le reste est illisible", () => {
    expect(lireJour("2025-09-12")).toBe(jour(2025, 9, 12));
    expect(lireJour("2025-09-12T23:30:00.000Z")).toBe(jour(2025, 9, 12));
    expect(lireJour("12/09/2025")).toBe(jour(2025, 9, 12));
    expect(lireJour("1/2/26")).toBe(jour(2026, 2, 1));
    for (const x of ["", null, undefined, "bientot", "2025-9"]) expect(lireJour(x as string)).toBeNull();
  });
});

describe("blessuresDeLaSaison", () => {
  const fenetre = fenetreSaison(2025);
  const ids = new Set(["a", "b"]);
  const liste = [
    b("1", "a", { dateDebut: "2025-08-01" }),            // premier jour de la saison
    b("2", "a", { dateDebut: "2026-07-31" }),            // dernier jour
    b("3", "b", { dateDebut: "2025-07-31" }),            // la veille : saison precedente
    b("4", "b", { dateDebut: "2026-08-01" }),            // le lendemain : saison suivante
    b("5", "c", { dateDebut: "2025-10-10" }),            // joueur d'une autre equipe
    b("6", "b", { dateDebut: null }),                    // sans date
    b("7", "a", { dateDebut: "12/11/2025" }),            // format francais
  ];
  it("garde celles dont le debut tombe dans la saison (bornes comprises), pour les joueurs de l'equipe", () => {
    expect(blessuresDeLaSaison(liste, ids, fenetre, false).map((x) => x.id)).toEqual(["1", "2", "7"]);
  });
  it("sans date : seulement sur la saison en cours", () => {
    expect(blessuresDeLaSaison(liste, ids, fenetre, true).map((x) => x.id)).toEqual(["1", "2", "6", "7"]);
  });
});

describe("joursDansLaSaison", () => {
  const f = fenetreSaison(2025);
  it("du debut au retour ; sans retour, jusqu'a aujourd'hui ; jamais au-dela de la fin de saison", () => {
    expect(joursDansLaSaison(b("1", "a", { dateDebut: "2025-10-01", retourEstime: "2025-10-11" }), f, NOW)).toBe(10);
    expect(joursDansLaSaison(b("2", "a", { dateDebut: "2026-02-01" }), f, NOW)).toBe(28);
    expect(joursDansLaSaison(b("3", "a", { dateDebut: "2026-07-20", retourEstime: "2026-09-01" }), f, NOW)).toBe(11);   // coupee au 31 juillet
    expect(joursDansLaSaison(b("4", "a", { dateDebut: "2025-09-01" }), f, jour(2027, 1, 1))).toBe(Math.round((f.fin - jour(2025, 9, 1)) / 86_400_000));   // jamais retablie, saison passee
  });
  it("dates inutilisables : zero", () => {
    expect(joursDansLaSaison(b("5", "a", { dateDebut: "n'importe quoi" }), f, NOW)).toBe(0);
    expect(joursDansLaSaison(b("6", "a", { dateDebut: "2025-10-01", retourEstime: "2025-09-01" }), f, NOW)).toBe(0);      // retour avant le debut
  });
});

describe("resumerBlessures", () => {
  const blessures: BlessureSaison[] = [
    b("1", "a", { localisation: "Cheville", gravite: "Legere", dateDebut: "2025-09-10", retourEstime: "2025-09-20", statut: "Retabli" }),    // 10 j
    b("2", "a", { localisation: "cheville", gravite: "Moyenne", dateDebut: "2025-11-05", retourEstime: "2025-11-25", statut: "Retabli" }),    // 20 j, rechute
    b("3", "b", { localisation: "Genou", gravite: "Grave", dateDebut: "2025-11-20", retourEstime: "2026-01-19", statut: "Retabli" }),         // 60 j
    b("4", "c", { localisation: "Ischio", dateDebut: "2026-02-15", statut: "Indisponible" }),                                                  // en cours : 14 j
    b("5", "c", { dateDebut: "2026-03-01", retourEstime: "2026-03-05", statut: "Reprise" }),                                                   // sans localisation
  ];
  const noms = new Map([["a", "Luc Durand"], ["b", "Paul Martin"]]);
  const r = resumerBlessures(blessures, 2025, NOW, noms);

  it("les totaux : blessures, joueurs touches, en cours, retablies, jours manques, duree moyenne", () => {
    expect(r).toMatchObject({ total: 5, joueursTouches: 3, enCours: 1, retablies: 4 });
    expect(r.joursManques).toBe(10 + 20 + 60 + 14 + 4);
    expect(r.dureeMoyenne).toBe(Math.round((10 + 20 + 60 + 4) / 4));              // seulement les blessures terminees et datees
    expect(r.plusLongue).toEqual({ joueurId: "b", nom: "Paul Martin", localisation: "Genou", jours: 60 });
  });

  it("par localisation : accents et casse confondus, les plus frequentes d'abord, 'Non precisee' pour les autres", () => {
    expect(r.parLocalisation.map((l) => [l.libelle, l.n, l.jours])).toEqual([
      ["Cheville", 2, 30], ["Genou", 1, 60], ["Ischio", 1, 14], ["Non precisee", 1, 4],
    ]);
  });

  it("par gravite : seulement quand elle est renseignee", () => {
    expect(r.parGravite.map((l) => [l.libelle, l.n])).toEqual([["Grave", 1], ["Moyenne", 1], ["Legere", 1]]);       // a nombre egal, la plus longue d'abord
    expect(resumerBlessures([b("9", "a", { dateDebut: "2025-09-10" })], 2025, NOW).parGravite).toEqual([]);
  });

  it("par mois : douze mois d'aout a juillet", () => {
    expect(r.parMois).toHaveLength(12);
    expect(r.parMois[0]).toEqual({ mois: "2025-08", libelle: "aout", n: 0 });
    expect(r.parMois[11]).toEqual({ mois: "2026-07", libelle: "juil.", n: 0 });
    const n = Object.fromEntries(r.parMois.map((m) => [m.mois, m.n]));
    expect(n).toMatchObject({ "2025-09": 1, "2025-11": 2, "2026-02": 1, "2026-03": 1, "2025-10": 0 });
  });

  it("par joueur : le plus touche d'abord, avec son nom d'effectif (a defaut celui de la blessure)", () => {
    expect(r.parJoueur.map((j) => [j.nom, j.n, j.jours])).toEqual([["Luc Durand", 2, 30], ["Joueur c", 2, 18], ["Paul Martin", 1, 60]]);
  });

  it("rechutes : meme joueur, meme endroit, au moins deux fois", () => {
    expect(r.rechutes).toEqual([{ joueurId: "a", nom: "Luc Durand", localisation: "Cheville", n: 2 }]);
  });

  it("aucune blessure : des zeros, jamais d'erreur ni de valeur inventee", () => {
    const vide = resumerBlessures([], 2025, NOW);
    expect(vide).toMatchObject({ total: 0, joueursTouches: 0, enCours: 0, retablies: 0, joursManques: 0, dureeMoyenne: null, plusLongue: null, parLocalisation: [], parJoueur: [], rechutes: [] });
    expect(vide.parMois.every((m) => m.n === 0)).toBe(true);
  });
});
