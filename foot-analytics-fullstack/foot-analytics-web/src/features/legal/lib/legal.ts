// src/features/legal/lib/legal.ts
//
// Version des conditions d'utilisation : a incrementer a chaque modification du texte (page /cgu). Un compte qui a
// accepte une version anterieure est invite a accepter la nouvelle a sa prochaine visite.

export const VERSION_CGU = "2026-10";

/** Le compte doit-il (re)accepter les conditions d'utilisation ? */
export function doitAccepterCgu(utilisateur: { cguVersion?: string | null } | null | undefined): boolean {
  return !!utilisateur && utilisateur.cguVersion !== VERSION_CGU;
}

/** Cookies deposes par l'application : tous strictement necessaires, aucun traceur ni mesure d'audience. */
export const COOKIES: { nom: string; finalite: string; duree: string }[] = [
  { nom: "fa_access", finalite: "Session : jeton d'accès (HttpOnly, illisible par les scripts)", duree: "15 minutes" },
  { nom: "fa_refresh", finalite: "Session : renouvellement du jeton d'accès (HttpOnly)", duree: "30 jours sans activité" },
  { nom: "ownClubId, ownEquipeId, ownSaisonId", finalite: "Club, équipe et saison choisis", duree: "1 an" },
  { nom: "ownSelValide", finalite: "Sélection déjà vérifiée (évite des appels inutiles)", duree: "2 minutes" },
  { nom: "fa_theme, fa_sidebar", finalite: "Préférences d'affichage (thème, barre latérale)", duree: "1 an" },
];
