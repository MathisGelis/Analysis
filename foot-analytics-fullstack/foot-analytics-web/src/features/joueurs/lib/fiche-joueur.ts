// src/features/joueurs/lib/fiche-joueur.ts
//
// Choix de la saison affichee sur la fiche joueur et indicateurs derives des
// stats DE CETTE SAISON. La fiche lisait auparavant les compteurs globaux du
// joueur (toutes saisons confondues) et ne les remettait a zero que si le
// joueur n'avait pas joue : un joueur en 2026-2027 affichait donc les buts et
// cartons de 2025-2026.

import type { HistoriqueSaison, LigneHistorique, Saison, TotauxSaison } from "@/shared/lib/types";

export const TOTAUX_VIDES: TotauxSaison = {
  matchs: 0, titularisations: 0, minutes: 0, buts: 0, passesDecisives: 0,
  cartonsJaunes: 0, cartonsRouges: 0, numeros: {}, noteMoyenne: null,
};

export interface SaisonFiche {
  /** Saison choisie (null si la base n'en connait aucune). */
  saison: Pick<Saison, "id" | "nom" | "actif"> | null;
  /** Parcours du joueur sur cette saison ; null s'il n'y est pas inscrit. */
  entree: HistoriqueSaison | null;
  totaux: TotauxSaison;
  /** Ligne (equipe) principale de la saison : la plus jouee. */
  ligne: LigneHistorique | null;
}

/**
 * Saison a afficher, par priorite : demandee dans l'URL, saison choisie dans le
 * selecteur (cookie), saison active, la plus recente du parcours. Un id qui ne
 * correspond a aucune saison connue est ignore.
 */
export function choisirSaisonFiche(args: {
  historique: HistoriqueSaison[];
  saisons: Pick<Saison, "id" | "nom" | "actif">[];
  demandee?: string | null;
  cookie?: string | null;
}): SaisonFiche {
  const { historique, saisons, demandee, cookie } = args;
  const parId = (id?: string | null) => (id ? saisons.find((s) => s.id === id) : undefined);
  const recente = historique.find((h) => h.saisonId)?.saisonId;   // parcours trie du plus recent
  const saison =
    parId(demandee) ?? parId(cookie) ?? saisons.find((s) => s.actif) ?? parId(recente) ?? null;
  const entree = saison ? historique.find((h) => h.saisonId === saison.id) ?? null : null;
  return {
    saison,
    entree,
    totaux: entree?.totaux ?? TOTAUX_VIDES,
    ligne: entree?.lignes[0] ?? null,
  };
}

/** Numero le plus porte sur la periode, null si aucun. */
export function numeroPrincipal(numeros: Record<string, number>): number | null {
  const tries = Object.entries(numeros).sort((a, b) => b[1] - a[1]);
  return tries.length ? Number(tries[0][0]) : null;
}

/** Indice de discipline 0-100 : un jaune coute 8 points, un rouge 24. */
export function indiceDiscipline(t: Pick<TotauxSaison, "cartonsJaunes" | "cartonsRouges">): number {
  return Math.max(0, 100 - (t.cartonsJaunes + t.cartonsRouges * 3) * 8);
}
