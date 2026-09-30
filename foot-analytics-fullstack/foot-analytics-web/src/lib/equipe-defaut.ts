// src/lib/equipe-defaut.ts
//
// Choix de l'equipe selectionnee par defaut pour un club, quand aucun cookie
// ne la designe (premiere connexion, changement de club, cookie efface).
// Fonction pure : partagee par le middleware (edge) et les tests.

import type { Equipe, Saison } from "@/lib/types";

/**
 * Premiere equipe de la saison souhaitee (cookie ownSaisonId s'il existe),
 * sinon de la saison active, sinon de la saison la plus recente ; a defaut
 * n'importe quelle equipe du club (premiere de la liste).
 */
export function choisirEquipeParDefaut(
  equipes: Equipe[],
  saisons: Saison[],
  saisonSouhaiteeId: string | null = null,
): { equipe: Equipe; saisonId: string | null } | null {
  if (equipes.length === 0) return null;
  const saison = (saisonSouhaiteeId ? saisons.find((s) => s.id === saisonSouhaiteeId) : null)
    ?? saisons.find((s) => s.actif)
    ?? saisons[0]
    ?? null;
  const equipe = equipes.find((e) => saison && e.saisonId === saison.id) ?? equipes[0];
  return { equipe, saisonId: equipe.saisonId ?? saison?.id ?? null };
}
