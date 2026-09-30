// src/lib/equipe-defaut.ts
//
// Choix de l'equipe selectionnee par defaut pour un club, quand aucun cookie
// ne la designe (premiere connexion, changement de club, cookie efface).
// Fonction pure : partagee par le middleware (edge) et les tests.

import type { Equipe, Saison } from "@/lib/types";

export interface ChoixParDefaut {
  /** Equipe a selectionner ; null si la saison choisie n'a aucune equipe. */
  equipe: Equipe | null;
  saisonId: string | null;
}

/**
 * - Saison DEJA choisie (cookie ownSaisonId valide) : on la respecte toujours.
 *   Si le club n'y a aucune equipe (saison en preparation, avant le
 *   "Reimporter les equipes"), on renvoie equipe=null plutot que de basculer
 *   sur une autre saison et d'ecraser le choix de l'utilisateur.
 * - Sinon : premiere equipe de la saison active (ou de la plus recente si
 *   aucune n'est active) ; a defaut, n'importe quelle equipe du club.
 */
export function choisirEquipeParDefaut(
  equipes: Equipe[],
  saisons: Saison[],
  saisonSouhaiteeId: string | null = null,
): ChoixParDefaut | null {
  const souhaitee = saisonSouhaiteeId
    ? saisons.find((s) => s.id === saisonSouhaiteeId) ?? null
    : null;
  if (souhaitee) {
    return {
      equipe: equipes.find((e) => e.saisonId === souhaitee.id) ?? null,
      saisonId: souhaitee.id,
    };
  }

  if (equipes.length === 0) return null;
  const saison = saisons.find((s) => s.actif) ?? saisons[0] ?? null;
  const equipe = equipes.find((e) => saison && e.saisonId === saison.id) ?? equipes[0];
  return { equipe, saisonId: equipe.saisonId ?? saison?.id ?? null };
}
