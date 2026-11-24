// src/common/fuzzy.ts
//
// Recherche floue de noms (joueurs) : tolere accents, casse, ordre nom/prenom,
// fautes de frappe et saisie partielle. Fonctions pures, sans dependance.
//
// Score dans [0, 1] : 1 = prefixe exact d'un mot, ~0.85 = sous-chaine,
// en dessous = proximite d'edition (Levenshtein) mot a mot.

/** Minuscules, sans accents ni ponctuation, espaces compactes. */
export function normaliser(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distance d'edition (insertion, suppression, substitution) en memoire O(min(n, m)). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > b.length) [a, b] = [b, a];
  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    const cur = [j];
    for (let i = 1; i <= a.length; i++) {
      cur[i] = Math.min(
        prev[i] + 1,
        cur[i - 1] + 1,
        prev[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[a.length];
}

/**
 * Distance d'edition BORNEE : la distance exacte si elle ne depasse pas `max`, sinon `max + 1`. S'arrete des qu'une ligne du calcul
 * depasse la borne : un mot qui ne ressemble pas a la requete est ecarte en quelques comparaisons, au lieu de tout calculer.
 */
export function levenshteinBorne(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length > b.length) [a, b] = [b, a];
  let prev = new Array<number>(a.length + 1);
  let cur = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    cur[0] = j;
    let minLigne = cur[0];
    const bj = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i++) {
      const v = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (a.charCodeAt(i - 1) === bj ? 0 : 1));
      cur[i] = v;
      if (v < minLigne) minLigne = v;
    }
    if (minLigne > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[a.length] > max ? max + 1 : prev[a.length];
}

/** Score d'un mot de la requete contre un mot du candidat. */
export function scoreMot(q: string, c: string): number {
  if (c.startsWith(q)) return 1;
  if (q.length >= 3 && c.includes(q)) return 0.85;
  // Une faute tolerable par tranche de 3 lettres, jamais sur un mot de 1-2 lettres.
  if (q.length < 3) return 0;
  const tolere = Math.max(1, Math.floor(q.length / 3));
  const d = levenshteinBorne(q, c.length > q.length ? c.slice(0, q.length + 1) : c, tolere);
  if (d > tolere) return 0;
  return Math.max(0.5, 1 - d / Math.max(q.length, 1)) * 0.9;
}

/** Les mots d'un texte, normalises (a faire une fois par requete, et une fois par candidat quand on garde un index). */
export function motsNormalises(texte: string | null | undefined): string[] {
  return normaliser(texte).split(" ").filter(Boolean);
}

/**
 * Score de mots de requete (deja normalises) contre les mots (deja normalises) d'un candidat : tous les mots de la requete doivent
 * trouver un mot correspondant ; le score est la moyenne des meilleurs. Le calcul de `scoreRecherche`, sans renormaliser.
 */
export function scoreMots(q: readonly string[], mots: readonly string[]): number {
  if (q.length === 0 || mots.length === 0) return 0;
  let total = 0;
  for (const mq of q) {
    let meilleur = 0;
    for (const mc of mots) {
      const s = scoreMot(mq, mc);
      if (s > meilleur) { meilleur = s; if (s === 1) break; }
    }
    if (meilleur === 0) return 0;
    total += meilleur;
  }
  return total / q.length;
}

/**
 * Score d'une requete contre un ou plusieurs libelles du meme candidat
 * (ex. ["DUPONT Jean", "Jean DUPONT"]). Tous les mots de la requete doivent
 * trouver un mot correspondant ; le score est la moyenne des meilleurs.
 */
export function scoreRecherche(requete: string, libelles: string[]): number {
  const q = motsNormalises(requete);
  if (q.length === 0) return 0;
  let meilleur = 0;
  for (const lib of libelles) meilleur = Math.max(meilleur, scoreMots(q, motsNormalises(lib)));
  return meilleur;
}
