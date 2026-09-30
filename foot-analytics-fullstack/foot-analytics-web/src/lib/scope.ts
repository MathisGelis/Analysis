// src/lib/scope.ts
//
// Resout le scope d'acces de l'utilisateur courant : quel clubId
// peut-il voir, quelles equipes lui sont autorisees. Utilise par les
// pages metier pour pre-filtrer leurs requetes API.
//
// Regle :
//   - Admin : pas de restriction (clubId / equipeIds libres via cookies)
//   - User  : clubId force a user.clubId, equipeIds restreintes a
//             user.equipeIds (vide = toutes les equipes du club)

import { getCurrentUserServer } from "@/lib/auth";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnEquipeIdServer } from "@/lib/own-equipe";

export interface Scope {
  role: "admin" | "user";
  /** Club autorise (toujours defini pour user, optionnel pour admin). */
  clubId: string | null;
  /** Equipes autorisees (vide = toutes celles du clubId). */
  allowedEquipeIds: string[] | null;
  /** Equipe selectionnee pour la vue courante (cookie ownEquipeId). */
  selectedEquipeId: string | null;
  /** True si l'utilisateur peut switcher entre clubs (admin uniquement). */
  canSwitchClub: boolean;
}

/**
 * A appeler dans tous les Server Components des pages metier.
 * - Admin : clubId vient du cookie ownClubId (fallback null)
 * - User  : clubId verrouille sur user.clubId. Le cookie ownClubId
 *   est ignore pour empecher tout contournement cote client.
 */
export async function resolveScope(): Promise<Scope> {
  const user = await getCurrentUserServer();
  const cookieEquipeId = getOwnEquipeIdServer();

  if (!user) {
    // Cas anormal (middleware aurait du rediriger), on renvoie un scope vide.
    return {
      role: "user",
      clubId: null,
      allowedEquipeIds: [],
      selectedEquipeId: null,
      canSwitchClub: false,
    };
  }
  if (user.role === "admin") {
    return {
      role: "admin",
      clubId: getOwnClubIdServer(),
      allowedEquipeIds: null,
      selectedEquipeId: cookieEquipeId,
      canSwitchClub: true,
    };
  }
  // User restreint a son scope.
  const allowed = (user.equipeIds ?? []).filter(Boolean);
  // Si l'equipe selectionnee n'appartient pas aux equipes autorisees,
  // on ignore le cookie (anti-contournement).
  let selectedEquipeId: string | null = cookieEquipeId;
  if (allowed.length > 0 && cookieEquipeId && !allowed.includes(cookieEquipeId)) {
    selectedEquipeId = allowed[0] ?? null;
  }
  return {
    role: "user",
    clubId: user.clubId ?? null,
    allowedEquipeIds: allowed.length > 0 ? allowed : null,
    selectedEquipeId,
    canSwitchClub: false,
  };
}

/**
 * Filtre une liste d'equipes selon les permissions. A appeler apres un
 * `api.equipes()` global.
 */
export function filtrerEquipes<T extends { id: string; clubId?: string | null }>(
  equipes: T[], scope: Scope,
): T[] {
  if (scope.role === "admin") return equipes;
  let filtered = scope.clubId
    ? equipes.filter((e) => e.clubId === scope.clubId)
    : equipes;
  if (scope.allowedEquipeIds && scope.allowedEquipeIds.length > 0) {
    const set = new Set(scope.allowedEquipeIds);
    filtered = filtered.filter((e) => set.has(e.id));
  }
  return filtered;
}
