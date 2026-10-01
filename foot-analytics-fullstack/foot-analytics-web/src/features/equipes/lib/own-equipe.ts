// src/features/equipes/lib/own-equipe.ts
//
// Identifiant de l'equipe "propre" actuellement selectionnee dans la sidebar.

import { cookies } from "next/headers";

/**
 * Equipe designee par le cookie. Les droits de l'utilisateur ne sont PAS
 * verifies ici : le middleware valide la selection (selectionValide) parmi les
 * seules equipes autorisees et reecrit le cookie. Remplacer ici l'equipe par la
 * premiere de `equipeIds` (comparaison d'ids exacts) renvoyait une equipe d'une
 * AUTRE saison des que l'equipe consultee etait un clone ou une equipe renommee.
 */
export function getOwnEquipeIdServer(): string | null {
  return cookies().get("ownEquipeId")?.value ?? null;
}

export function getOwnSaisonIdServer(): string | null {
  return cookies().get("ownSaisonId")?.value ?? null;
}
