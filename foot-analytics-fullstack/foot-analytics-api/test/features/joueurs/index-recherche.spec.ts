// L'index de recherche des joueurs : memes resultats que l'ancienne recherche (tout relire et renormaliser a chaque frappe), mais prepare une fois.

import { scoreRecherche } from "@/common/fuzzy";
import { chercherParLicence, chercherParNom, construireIndex, DUREE_MAX_MS, IndexJoueurs, LigneJoueur } from "@/features/joueurs/index-recherche";

const SEUIL = 0.6;
const lignes: LigneJoueur[] = [
  { id: "1", nom: "MARTIN", prenom: "Léo", licence: "2001", clubId: "A" },
  { id: "2", nom: "MARTIN", prenom: "Lucas", licence: "2002", clubId: "B" },
  { id: "3", nom: "MARTINEZ", prenom: "Enzo", licence: "3001", clubId: "A" },
  { id: "4", nom: "MARTEN", prenom: "Luc", licence: null, clubId: "A" },
  { id: "5", nom: "DUPONT-DURAND", prenom: "Jean", licence: "4001", clubId: "B" },
  { id: "6", nom: "EL AMRANI", prenom: "Yanis", licence: "4002", clubId: null },
  { id: "7", nom: "MÜLLER", prenom: "Théo", licence: "5001", clubId: "A" },
  { id: "8", nom: "BERTRAND", prenom: "Jean-Pierre", licence: "5002", clubId: "B" },
];

/** L'ancienne recherche, telle qu'elle etait : tout scorer avec scoreRecherche, trier, couper. */
function ancienne(saisie: string, limite: number) {
  return lignes
    .map((j) => ({ j, score: scoreRecherche(saisie, [`${j.nom} ${j.prenom ?? ""}`, `${j.prenom ?? ""} ${j.nom}`]) }))
    .filter((x) => x.score >= SEUIL)
    .sort((a, b) => b.score - a.score || (a.j.nom ?? "").localeCompare(b.j.nom ?? ""))
    .slice(0, limite).map((x) => x.j.id);
}

describe("chercherParNom", () => {
  const index = construireIndex(lignes);

  it("les memes identifiants, dans le meme ordre, que l'ancienne recherche", () => {
    for (const saisie of ["ma", "mart", "martin", "martin lu", "marten", "dupond", "jean", "jean pierre", "amrani", "muller", "theo", "bertran", "zzz", "é"]) {
      for (const limite of [1, 3, 20]) expect(chercherParNom(index, saisie, SEUIL, limite)).toEqual(ancienne(saisie, limite));
    }
  });

  it("une saisie vide ne trouve rien ; la limite coupe", () => {
    expect(chercherParNom(index, "  ", SEUIL, 5)).toEqual([]);
    expect(chercherParNom(index, "mar", SEUIL, 2)).toHaveLength(2);
  });

  it("un mot partage par plusieurs joueurs n'est garde qu'une fois dans le dictionnaire", () => {
    expect(index.dictionnaire.filter((m) => m === "martin")).toHaveLength(1);
    expect(index.entrees[0].mots.length).toBe(2);
  });
});

describe("chercherParLicence", () => {
  const index = construireIndex(lignes);
  it("debut de licence ; seulement mon club quand il est donne ; sans licence : jamais", () => {
    expect(chercherParLicence(index, "20", undefined, 20)).toEqual(["1", "2"]);
    expect(chercherParLicence(index, "20", "A", 20)).toEqual(["1"]);
    expect(chercherParLicence(index, "9", undefined, 20)).toEqual([]);
  });
});

describe("IndexJoueurs : cache", () => {
  const lire = (compteur: { n: number }) => async () => { compteur.n++; return lignes; };

  it("ne relit la base qu'une fois, meme avec plusieurs recherches en meme temps", async () => {
    const c = { n: 0 };
    const idx = new IndexJoueurs();
    await Promise.all([idx.obtenir(lire(c), 0), idx.obtenir(lire(c), 0), idx.obtenir(lire(c), 0)]);
    await idx.obtenir(lire(c), 1000);
    expect(c.n).toBe(1);
  });

  it("invalide : la recherche suivante attend la relecture", async () => {
    const c = { n: 0 };
    const idx = new IndexJoueurs();
    await idx.obtenir(lire(c), 0);
    idx.invalider();
    await idx.obtenir(lire(c), 10);
    expect(c.n).toBe(2);
  });

  it("vieux : repond tout de suite avec l'index en place, relit en arriere-plan", async () => {
    const c = { n: 0 };
    const idx = new IndexJoueurs();
    const premier = await idx.obtenir(lire(c), 0);
    const vieux = await idx.obtenir(lire(c), DUREE_MAX_MS + 1);
    expect(vieux).toBe(premier);                       // pas d'attente : l'ancien index sert
    await new Promise((r) => setImmediate(r));
    expect(c.n).toBe(2);                                // ... et la relecture est partie
    expect(await idx.obtenir(lire(c), DUREE_MAX_MS + 2)).not.toBe(premier);
  });

  it("une relecture en echec garde l'index en place", async () => {
    const idx = new IndexJoueurs();
    const premier = await idx.obtenir(async () => lignes, 0);
    expect(await idx.obtenir(async () => { throw new Error("base indisponible"); }, DUREE_MAX_MS + 1)).toBe(premier);
    await new Promise((r) => setImmediate(r));
    expect(await idx.obtenir(async () => lignes, DUREE_MAX_MS + 2)).toBe(premier);
  });
});
