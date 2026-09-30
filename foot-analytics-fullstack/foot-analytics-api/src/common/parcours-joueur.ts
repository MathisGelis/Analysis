// src/common/parcours-joueur.ts
//
// Parcours d'un joueur deduit de ses apparitions sur les feuilles de match : club le plus recent,
// club a la fin de chaque saison, derniere saison connue, changement de club d'une saison a l'autre.
// Fonctions pures : la fiche `joueurs` porte UN club, celui ou la derivation l'a vu en premier ;
// c'est ce parcours qui dit ou il joue reellement aujourd'hui.

import { parseDateFlexible } from "./periode";

export interface Apparition {
  clubId: string;
  saisonId: string | null;
  /** Date du match ("jj/mm/aaaa" ou ISO), si connue. */
  date: string | null;
}

export interface SaisonRef { id: string; nom: string; anneeDebut: number }

/** Debut de saison retenu quand seule la saison est connue : 1er juillet. */
const debutSaison = (s: SaisonRef) => Date.UTC(s.anneeDebut, 6, 1);

/** Instant d'une apparition : la date du match, sinon le debut de sa saison, sinon inconnu. */
function instant(a: Apparition, saisons: Map<string, SaisonRef>): number | null {
  const d = parseDateFlexible(a.date);
  if (d !== null) return d;
  const s = a.saisonId ? saisons.get(a.saisonId) : undefined;
  return s ? debutSaison(s) : null;
}

/** L'apparition la plus recente (a dates egales, la derniere de la liste) ; null si aucune n'est datable. */
export function derniereApparition(apps: Apparition[], saisons: Map<string, SaisonRef>): Apparition | null {
  let meilleure: { a: Apparition; t: number } | null = null;
  for (const a of apps) {
    const t = instant(a, saisons);
    if (t !== null && (!meilleure || t >= meilleure.t)) meilleure = { a, t };
  }
  return meilleure?.a ?? null;
}

/** Club a la fin de chaque saison connue (celui de son dernier match de la saison). */
export function clubParSaison(apps: Apparition[], saisons: Map<string, SaisonRef>): Map<string, string> {
  const parSaison = new Map<string, Apparition[]>();
  for (const a of apps) {
    if (!a.saisonId || !saisons.has(a.saisonId)) continue;
    (parSaison.get(a.saisonId) ?? parSaison.set(a.saisonId, []).get(a.saisonId)!).push(a);
  }
  const res = new Map<string, string>();
  for (const [saisonId, liste] of parSaison) {
    const d = derniereApparition(liste, saisons);
    if (d) res.set(saisonId, d.clubId);
  }
  return res;
}

/** La saison la plus recente parmi celles des apparitions (par annee de debut), null sans saison connue. */
export function derniereSaison(apps: Apparition[], saisons: Map<string, SaisonRef>): SaisonRef | null {
  let res: SaisonRef | null = null;
  for (const a of apps) {
    const s = a.saisonId ? saisons.get(a.saisonId) : undefined;
    if (s && (!res || s.anneeDebut > res.anneeDebut)) res = s;
  }
  return res;
}

export type ChangementClub = "meme_club" | "club_different" | "inconnu";

/**
 * Le club de la saison la plus recente est-il celui de la saison PRECEDENTE ? Seule la saison qui suit
 * immediatement (annee de debut - 1) compte : un trou dans le parcours ne dit rien. `inconnu` sans les
 * deux saisons.
 */
export function changementDeClub(apps: Apparition[], saisons: Map<string, SaisonRef>): ChangementClub {
  const courante = derniereSaison(apps, saisons);
  if (!courante) return "inconnu";
  const precedente = [...saisons.values()].find((s) => s.anneeDebut === courante.anneeDebut - 1);
  if (!precedente) return "inconnu";
  const clubs = clubParSaison(apps, saisons);
  const avant = clubs.get(precedente.id);
  const maintenant = clubs.get(courante.id);
  if (!avant || !maintenant) return "inconnu";
  return avant === maintenant ? "meme_club" : "club_different";
}

/** "2024-2025" -> "24-25" ; un autre format est rendu tel quel. */
export function saisonCourte(nom: string): string {
  const m = (nom ?? "").match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  return m ? `${m[1].slice(2)}-${m[2].slice(2)}` : nom;
}

// ---------------------------------------------------------------------------
//  Statut de mutation
// ---------------------------------------------------------------------------

export const PAS_MUTATION = "Pas mutation";
export const MUTATION = "Mutation";
export const MUTATION_HORS_DELAI = "Mutation hors delai";
export const NON_CONNU = "Non connu";

/** Un rattachement a une equipe (effectif) vaut presence dans la saison de cette equipe, au club de l'equipe. */
export function apparitionsDesEquipes(equipes: { clubId: string; saisonId?: string | null }[]): Apparition[] {
  return equipes.map((e) => ({ clubId: e.clubId, saisonId: e.saisonId ?? null, date: null }));
}

/**
 * Une valeur est-elle une saisie du staff ? Le drapeau l'affirme pour les modifications recentes ; "Mutation" et
 * "Mutation hors delai" ne sont jamais ecrits par le calcul automatique : ce sont forcement des saisies.
 */
export function statutSaisi(actuel: string | null | undefined, drapeau: boolean | null | undefined): boolean {
  return !!drapeau || actuel === MUTATION || actuel === MUTATION_HORS_DELAI;
}

/**
 * Statut de mutation par defaut d'un joueur d'apres son parcours de clubs :
 *  - meme club cette saison et la precedente : Pas mutation, toujours (sans changement de club il n'y a pas de mutation) ;
 *  - club different de la saison precedente : Mutation, sauf saisie du staff (par exemple Mutation hors delai) ;
 *  - parcours insuffisant : la valeur en place ; `parDefaut` remplace une valeur absente ou "Non connu".
 */
export function statutMutationDeduit(p: {
  actuel: string | null | undefined;
  saisi: boolean;
  changement: ChangementClub;
  parDefaut: string;
}): string {
  if (p.changement === "meme_club") return PAS_MUTATION;
  if (p.changement === "club_different") return p.saisi && p.actuel ? p.actuel : MUTATION;
  // Parcours insuffisant : on garde ce qui est en place. "Non connu" n'est qu'un defaut (il ne vaut que pour les
  // adversaires) : il laisse la place au defaut du moment, par exemple Pas mutation pour un joueur de mon club.
  if (p.saisi && p.actuel) return p.actuel;
  return p.actuel && p.actuel !== NON_CONNU ? p.actuel : p.parDefaut;
}
