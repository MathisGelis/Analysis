// src/features/avant-match/lib/numeros.ts
//
// Le numero que chaque joueur retenu portera CE jour-la : celui que le staff choisit, sinon son numero habituel (celui de ses
// feuilles de match). Deux joueurs ne portent jamais le meme numero ; chaque joueur retenu en a un. Fonctions pures.

export const NUMERO_MIN = 1;
export const NUMERO_MAX = 99;

export type Choisis = Record<string, number | null | undefined>;

/** Le numero effectif d'un joueur : le choix du staff, sinon l'habituel, sinon aucun. */
export const numeroEffectif = (id: string, choisis: Choisis, habituels: Record<string, number | null | undefined>): number | null =>
  choisis[id] ?? habituels[id] ?? null;

export const numeroValide = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= NUMERO_MIN && n <= NUMERO_MAX;

/** Ce qu'on lit dans la case d'un champ : vide = pas de choix (on retombe sur l'habituel) ; sinon un entier ou null si illisible. */
export function lireSaisie(texte: string): number | null | undefined {
  const t = texte.trim();
  if (t === "") return undefined;
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return numeroValide(n) ? n : null;
}

export interface ProblemeNumeros {
  /** Joueurs retenus sans numero. */
  manquants: string[];
  /** Numero -> les joueurs qui se le disputent (au moins deux). */
  doublons: Map<number, string[]>;
  /** Un numero choisi hors de 1 a 99. */
  invalides: string[];
}

export function verifierNumeros(retenus: string[], choisis: Choisis, habituels: Record<string, number | null | undefined>): ProblemeNumeros {
  const manquants: string[] = [], invalides: string[] = [];
  const parNumero = new Map<number, string[]>();
  for (const id of retenus) {
    const brut = choisis[id];
    if (brut !== undefined && brut !== null && !numeroValide(brut)) { invalides.push(id); continue; }
    const n = numeroEffectif(id, choisis, habituels);
    if (n === null || !numeroValide(n)) { manquants.push(id); continue; }
    parNumero.set(n, [...(parNumero.get(n) ?? []), id]);
  }
  const doublons = new Map([...parNumero].filter(([, ids]) => ids.length > 1));
  return { manquants, doublons, invalides };
}

export const numerosOk = (p: ProblemeNumeros) => p.manquants.length === 0 && p.doublons.size === 0 && p.invalides.length === 0;

/** Ce qu'on envoie a l'API : le numero effectif de chaque joueur retenu, explicite (le plan garde ce qu'on a vu a l'ecran). */
export function numerosAEnvoyer(retenus: string[], choisis: Choisis, habituels: Record<string, number | null | undefined>): Record<string, number> {
  const sortie: Record<string, number> = {};
  for (const id of retenus) { const n = numeroEffectif(id, choisis, habituels); if (n !== null && numeroValide(n)) sortie[id] = n; }
  return sortie;
}
