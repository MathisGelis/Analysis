// src/features/recherche/lib/recherche.ts
//
// Recherche tolerante pour la barre de recherche : insensible aux accents, a
// la casse et a l'ordre des mots. Fonctions pures.

export function normaliser(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Score d'une requete sur un ou plusieurs textes ; 0 = pas de correspondance.
 * Chaque mot de la requete doit apparaitre : debut de mot (3 points) ou
 * fragment (1 point). Un texte qui commence par la requete gagne un bonus.
 */
export function scoreRecherche(requete: string, ...textes: (string | null | undefined)[]): number {
  const mots = normaliser(requete).split(" ").filter(Boolean);
  if (mots.length === 0) return 0;
  const corpus = normaliser(textes.filter(Boolean).join(" "));
  if (!corpus) return 0;
  const motsCorpus = corpus.split(" ");
  let total = 0;
  for (const m of mots) {
    if (motsCorpus.some((c) => c.startsWith(m))) total += 3;
    else if (corpus.includes(m)) total += 1;
    else return 0;
  }
  if (corpus.startsWith(mots.join(" "))) total += 4;
  return total;
}
