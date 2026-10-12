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

/** Score d'un mot de la requete contre un mot du candidat. */
function scoreMot(q: string, c: string): number {
  if (c.startsWith(q)) return 1;
  if (q.length >= 3 && c.includes(q)) return 0.85;
  // Une faute tolerable par tranche de 3 lettres, jamais sur un mot de 1-2 lettres.
  if (q.length < 3) return 0;
  const d = levenshtein(q, c.length > q.length ? c.slice(0, q.length + 1) : c);
  const tolere = Math.max(1, Math.floor(q.length / 3));
  if (d > tolere) return 0;
  return Math.max(0.5, 1 - d / Math.max(q.length, 1)) * 0.9;
}

/**
 * Score d'une requete contre un ou plusieurs libelles du meme candidat
 * (ex. ["DUPONT Jean", "Jean DUPONT"]). Tous les mots de la requete doivent
 * trouver un mot correspondant ; le score est la moyenne des meilleurs.
 */
export function scoreRecherche(requete: string, libelles: string[]): number {
  const q = normaliser(requete).split(" ").filter(Boolean);
  if (q.length === 0) return 0;
  let meilleur = 0;
  for (const lib of libelles) {
    const mots = normaliser(lib).split(" ").filter(Boolean);
    if (mots.length === 0) continue;
    let total = 0;
    let ok = true;
    for (const mq of q) {
      const s = Math.max(...mots.map((mc) => scoreMot(mq, mc)));
      if (s === 0) { ok = false; break; }
      total += s;
    }
    if (ok) meilleur = Math.max(meilleur, total / q.length);
  }
  return meilleur;
}
