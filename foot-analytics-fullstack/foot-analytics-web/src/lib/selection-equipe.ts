// src/lib/selection-equipe.ts
//
// Selection "equipe + saison" TOUJOURS valide. Deux cookies (ownEquipeId,
// ownSaisonId) designent ce que le coach consulte, mais ils survivent a la
// base : equipe supprimee ou fusionnee avec la vraie poule, saison reconstruite,
// changement de club, permissions restreintes. Un cookie perime donnait
// "Aucune equipe" dans le selecteur et des pages vides apres un rafraichissement.
// On ne laisse donc jamais la selection vide tant que le club a une equipe.
//
// Fonction pure, partagee par le middleware (edge), le selecteur et les tests.

import { equipeEquivalente } from "@/lib/empreinte-equipe";
import type { Equipe, Saison } from "@/lib/types";

export interface SelectionEquipe {
  /** null uniquement si le club n'a aucune equipe (autorisee). */
  equipe: Equipe | null;
  saisonId: string | null;
  /** Les cookies d'origine ne disaient pas la meme chose : a reecrire. */
  corrigee: boolean;
}

/**
 * Ordre de decision :
 *  1. equipe du cookie, si elle existe et colle a la saison du cookie ;
 *  2. saison du cookie valide : son equivalent (meme categorie...) sur cette
 *     saison, sinon la premiere equipe de la saison ;
 *  3. equipe du cookie sans equipe sur la saison choisie : on la garde, avec SA saison
 *     (mieux qu'une selection vide) ;
 *  4. pas de cookie exploitable : premiere equipe de la saison active, sinon de la
 *     saison la plus recente qui en a, sinon n'importe laquelle.
 */
export function selectionValide(args: {
  equipes: Equipe[];
  saisons: Saison[];
  equipeId?: string | null;
  saisonId?: string | null;
}): SelectionEquipe {
  const { equipes, saisons } = args;
  const eqCookie = args.equipeId ? equipes.find((e) => e.id === args.equipeId) ?? null : null;
  const saisonCookie = args.saisonId ? saisons.find((s) => s.id === args.saisonId) ?? null : null;

  const finaliser = (equipe: Equipe | null, saisonId: string | null): SelectionEquipe => ({
    equipe, saisonId,
    corrigee: (equipe?.id ?? null) !== (args.equipeId ?? null) || saisonId !== (args.saisonId ?? null),
  });

  if (equipes.length === 0) return finaliser(null, saisonCookie?.id ?? null);

  const dansSaison = (saisonId: string) => equipes.filter((e) => e.saisonId === saisonId);

  if (eqCookie && (!saisonCookie || eqCookie.saisonId === saisonCookie.id)) {
    return finaliser(eqCookie, eqCookie.saisonId ?? saisonCookie?.id ?? null);
  }

  if (saisonCookie) {
    const candidates = dansSaison(saisonCookie.id);
    if (candidates.length > 0) {
      const choisie = (eqCookie ? candidates.find((e) => equipeEquivalente(e, eqCookie)) : null) ?? candidates[0];
      return finaliser(choisie, saisonCookie.id);
    }
    if (eqCookie) return finaliser(eqCookie, eqCookie.saisonId ?? null);
  }

  const parRecence = [...saisons].sort((a, b) => b.anneeDebut - a.anneeDebut);
  const active = saisons.find((s) => s.actif);
  for (const s of [active, ...parRecence]) {
    if (!s) continue;
    const candidates = dansSaison(s.id);
    if (candidates.length > 0) return finaliser(candidates[0], s.id);
  }
  return finaliser(equipes[0], equipes[0].saisonId ?? null);
}
