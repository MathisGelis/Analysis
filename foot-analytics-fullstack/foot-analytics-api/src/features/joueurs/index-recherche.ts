// src/features/joueurs/index-recherche.ts
//
// Index en memoire des noms de joueurs pour la barre de recherche. Avant, chaque frappe relisait TOUTE la table des joueurs et
// renormalisait chaque nom (accents, casse) : plusieurs secondes sur une base de plusieurs dizaines de milliers de joueurs. Ici :
//  - les mots normalises de chaque joueur sont calcules une fois et gardes (un dictionnaire de mots distincts, chaque joueur pointe vers ses mots) ;
//  - une recherche note chaque mot DISTINCT une seule fois (un nom de famille partage par cent joueurs n'est compare qu'une fois),
//    puis chaque joueur ne fait que retrouver la note de ses mots.
// L'index se reconstruit quand il est invalide (creation, modification, suppression) ou apres `DUREE_MAX_MS` (import, derivation).
// Les scores sont exactement ceux de `scoreRecherche` (common/fuzzy.ts).

import { motsNormalises, scoreMot } from "@/common/fuzzy";

export interface JoueurIndexe { id: string; nom: string; licence: string | null; clubId: string | null; mots: number[] }
export interface LigneJoueur { id: string; nom: string; prenom?: string | null; licence?: string | null; clubId?: string | null }
export interface Index { entrees: JoueurIndexe[]; dictionnaire: string[] }

/** Passe ce delai, l'index est relu : rattrape toute ecriture qui ne l'aurait pas invalide (import, derivation). */
export const DUREE_MAX_MS = 30_000;

export function construireIndex(lignes: readonly LigneJoueur[]): Index {
  const ids = new Map<string, number>();
  const dictionnaire: string[] = [];
  const entrees = lignes.map((j): JoueurIndexe => {
    // « nom prenom » et « prenom nom » ont les memes mots : un seul jeu de mots suffit.
    const mots = [...new Set(motsNormalises(`${j.nom} ${j.prenom ?? ""}`))].map((m) => {
      let id = ids.get(m);
      if (id === undefined) { id = dictionnaire.length; ids.set(m, id); dictionnaire.push(m); }
      return id;
    });
    return { id: j.id, nom: j.nom, licence: j.licence ?? null, clubId: j.clubId ?? null, mots };
  });
  return { entrees, dictionnaire };
}

export class IndexJoueurs {
  private index: Index | null = null;
  private construitLe = 0;
  private enCours: Promise<Index> | null = null;

  invalider() { this.index = null; }

  /**
   * L'index. Invalide (creation, modification, suppression) ou jamais construit : on attend la relecture, la recherche voit la base a jour.
   * Simplement vieux (`DUREE_MAX_MS`) : on repond tout de suite avec l'index en place et on le relit en arriere-plan, pour qu'aucune
   * frappe n'attende la relecture de toute la table. Plusieurs recherches en meme temps ne lancent qu'une seule lecture.
   */
  async obtenir(lire: () => Promise<LigneJoueur[]>, maintenant = Date.now()): Promise<Index> {
    const relire = () => {
      if (!this.enCours) {
        this.enCours = lire().then((lignes) => {
          this.index = construireIndex(lignes);
          this.construitLe = maintenant;
          return this.index;
        }).finally(() => { this.enCours = null; });
      }
      return this.enCours;
    };
    if (!this.index) return relire();
    if (maintenant - this.construitLe >= DUREE_MAX_MS) relire().catch(() => { /* garde l'index en place, reessaie a la prochaine recherche */ });
    return this.index;
  }
}

/** Les `limite` meilleurs joueurs pour une saisie de nom : meilleur score d'abord, puis ordre alphabetique. */
export function chercherParNom(index: Index, saisie: string, seuil: number, limite: number): string[] {
  const q = motsNormalises(saisie);
  if (q.length === 0) return [];
  // Une note par mot DISTINCT et par mot de la requete.
  const notes = q.map((mq) => Float64Array.from(index.dictionnaire, (mot) => scoreMot(mq, mot)));
  const trouves: { id: string; nom: string; score: number }[] = [];
  for (const e of index.entrees) {
    let total = 0;
    let ok = true;
    for (const n of notes) {
      let meilleur = 0;
      for (const m of e.mots) if (n[m] > meilleur) meilleur = n[m];
      if (meilleur === 0) { ok = false; break; }
      total += meilleur;
    }
    if (!ok) continue;
    const score = total / q.length;
    if (score >= seuil) trouves.push({ id: e.id, nom: e.nom, score });
  }
  return trouves.sort((a, b) => b.score - a.score || (a.nom ?? "").localeCompare(b.nom ?? "")).slice(0, limite).map((x) => x.id);
}

/** Les `limite` premiers joueurs dont la licence commence par la saisie (de mon club seulement si `clubId` est donne). */
export function chercherParLicence(index: Index, saisie: string, clubId: string | null | undefined, limite: number): string[] {
  return index.entrees
    .filter((e) => (!clubId || e.clubId === clubId) && (e.licence ?? "").startsWith(saisie))
    .sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? "")).slice(0, limite).map((e) => e.id);
}
