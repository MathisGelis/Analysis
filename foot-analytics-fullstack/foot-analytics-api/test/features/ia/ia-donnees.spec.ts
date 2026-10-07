import { construireJeuDonnees, EntreesDonnees, lundiDe } from "@/features/ia/ia-donnees";
import { ligue } from "./ligue";

const jour = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

describe("lundiDe", () => {
  it("le lundi (00 h UTC) de la semaine, dimanche compris", () => {
    expect(lundiDe(jour("2025-09-06"))).toBe(jour("2025-09-01"));      // samedi
    expect(lundiDe(jour("2025-09-07"))).toBe(jour("2025-09-01"));      // dimanche
    expect(lundiDe(jour("2025-09-08"))).toBe(jour("2025-09-08"));      // lundi
    expect(lundiDe(jour("2025-09-01") + 15 * 3600_000)).toBe(jour("2025-09-01"));
  });
});

describe("construireJeuDonnees", () => {
  it("deux feuilles par match, classees par date, regroupees par semaine", () => {
    const jeu = construireJeuDonnees(ligue({ clubs: 4, semaines: 3 }));
    expect(jeu.resume).toMatchObject({ matchsLus: 6, feuilles: 12, etapes: 3, equipes: 4, premiere: "06/09/2025", derniere: "20/09/2025" });
    expect(jeu.etapes.map((e) => e.feuilles.length)).toEqual([4, 4, 4]);
    expect(jeu.etapes.map((e) => e.libelle)).toEqual(["Semaine du 01/09/2025", "Semaine du 08/09/2025", "Semaine du 15/09/2025"]);
    expect(jeu.etapes.map((e) => e.journees)).toEqual(["J1", "J2", "J3"]);
    const temps = jeu.feuilles.map((f) => f.temps);
    expect([...temps].sort((a, b) => a - b)).toEqual(temps);
    // Une feuille d'equipe : 16 joueurs, 11 titulaires, le dispositif absent tant que le staff ne l'a pas saisi.
    const f = jeu.feuilles[0];
    expect(f.lignes).toHaveLength(16);
    expect(f.lignes.filter((l) => l.titulaire)).toHaveLength(11);
    expect(f.formation).toBeNull();
  });

  it("un match du samedi et un du dimanche sont dans la meme semaine ; un match du lundi dans la suivante", () => {
    const e = ligue({ clubs: 4, semaines: 1 });
    e.matchs[0].date = "07/09/2025";
    e.matchs[1].date = "08/09/2025";
    const jeu = construireJeuDonnees(e);
    expect(jeu.etapes.map((x) => x.feuilles.length)).toEqual([2, 2]);
  });

  it("une equipe garde son identite d'une saison a l'autre, meme quand sa poule change", () => {
    const s25 = ligue({ clubs: 4, semaines: 2, saisonId: "s25", prefixe: "a" });
    const s26 = ligue({ clubs: 4, semaines: 2, saisonId: "s26", prefixe: "b" });
    s26.equipes.forEach((e) => { e.nom = "Seniors D2 Poule A"; });
    for (const m of s26.matchs) m.date = m.date!.replace("/2025", "/2026");
    const jeu = construireJeuDonnees({
      matchs: [...s25.matchs, ...s26.matchs], equipes: [...s25.equipes, ...s26.equipes], clubs: s25.clubs, compos: [...s25.compos, ...s26.compos],
    });
    expect(jeu.resume.equipes).toBe(4);
    expect(jeu.resume.saisons.sort()).toEqual(["s25", "s26"]);
  });

  it("un club qui aligne deux equipes de la meme categorie : elles restent distinctes (par division)", () => {
    const e = ligue({ clubs: 4, semaines: 2 });
    e.equipes.push({ id: "e0-bis", clubId: "c0", categorie: "Seniors", division: "D4", nom: "Seniors D4 Poule B", saisonId: "s25" });
    e.matchs[0].equipeDomId = "e0-bis";
    const jeu = construireJeuDonnees(e);
    expect(jeu.resume.equipes).toBe(5);
  });

  it("ecarte et compte ce qui ne peut pas servir : sans date, sans feuille, feuille incomplete, hors saison, match non joue", () => {
    const e = ligue({ clubs: 4, semaines: 3 });
    e.matchs[0].date = null;                                             // sans date
    e.compos = e.compos.filter((c) => c.matchId !== e.matchs[1].id);     // sans feuille
    const incomplet = e.matchs[2].id;
    e.compos.find((c) => c.matchId === incomplet && c.cote === "dom" && c.titulaire)!.titulaire = false;   // 10 titulaires
    e.matchs[3].statut = "prevu";
    const jeu = construireJeuDonnees(e);
    expect(jeu.resume.ecartes).toMatchObject({ sansDate: 1, feuilleIncomplete: 1, horsSaison: 0 });
    expect(jeu.resume.ecartes.sansFeuille).toBe(1);
    expect(jeu.resume.matchsLus).toBe(6 - 1 - 1 - 1 + 0);                // 3 semaines x 2 matchs, moins sans date, sans feuille, programme

    const saison = construireJeuDonnees({ ...ligue({ clubs: 4, semaines: 2 }), saisonIds: ["autre"] });
    expect(saison.resume).toMatchObject({ feuilles: 0, etapes: 0 });
    expect(saison.resume.ecartes.horsSaison).toBe(4);
  });

  it("le dispositif saisi est repris, jamais le couple invente par l'ancien import", () => {
    const saisi = construireJeuDonnees(ligue({ clubs: 4, semaines: 1, formation: "4-3-3" }));
    expect(saisi.feuilles.every((f) => f.formation === "4-3-3")).toBe(true);
    const e: EntreesDonnees = ligue({ clubs: 4, semaines: 1 });
    for (const m of e.matchs) { m.formationDom = "4-4-2"; m.formationExt = "4-2-3-1"; }
    expect(construireJeuDonnees(e).feuilles.every((f) => f.formation === null)).toBe(true);
  });

  it("deux joueurs de meme cle sur une feuille : le premier seulement ; identite = licence, sinon nom", () => {
    const e = ligue({ clubs: 4, semaines: 1 });
    const m = e.matchs[0].id;
    const doublon = e.compos.find((c) => c.matchId === m && c.cote === "dom" && !c.titulaire)!;
    e.compos.push({ ...doublon, numero: 99 });
    const jeu = construireJeuDonnees(e);
    expect(jeu.feuilles.find((f) => f.matchId === m && f.domicile)!.lignes).toHaveLength(16);
    expect(jeu.feuilles[0].lignes[0].joueur).toMatch(/^lic:/);
  });
});
