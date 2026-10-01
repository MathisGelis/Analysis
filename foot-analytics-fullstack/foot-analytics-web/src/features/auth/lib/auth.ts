// src/features/auth/lib/auth.ts
//
// Storage cote client du JWT + helpers session. Stocke dans :
//  - localStorage  : "fa.token", "fa.user"   (pour le navigateur)
//  - cookie "fa_token" : pour que le middleware Next + les Server
//    Components puissent lire le token aussi (lecture serveur).

import { decoderPayloadJwt } from "./jwt";

export interface User {
  id: string;
  login: string;
  prenom: string;
  nom: string;
  role: "admin" | "referent" | "user";
  clubId?: string | null;
  equipeIds?: string[] | null;
  /** Saisons consultables (educateur) : voir features/comptes/lib/acces-saisons.ts. Absent : toutes. */
  toutesSaisons?: boolean | null;
  saisonIds?: string[] | null;
  mustChangePassword: boolean;
}

const TOKEN_KEY = "fa.token";
const USER_KEY = "fa.user";
const COOKIE_NAME = "fa_token";

/**
 * Cote client. Efface la selection club/equipe/saison de la session
 * precedente : sans ca, un cookie d'equipe d'un autre utilisateur (ou d'un
 * autre club) survit a la reconnexion. Le middleware re-selectionne ensuite
 * l'equipe par defaut au chargement suivant.
 */
function viderSelectionCookies() {
  for (const nom of ["ownEquipeId", "ownSaisonId", "ownClubId"]) {
    document.cookie = `${nom}=; path=/; max-age=0; samesite=lax`;
  }
}

/** Cote client uniquement. Pose le token dans localStorage + cookie. */
export function setSession(token: string, user: User) {
  if (typeof window === "undefined") return;
  viderSelectionCookies();
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Cookie 7j, lisible cote serveur via cookies() de next/headers.
  document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
}

/** Cote client. Lit le user en cache (pas un appel reseau). */
export function getCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Cote client. Lit le token brut. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Cote client. Detruit la session. */
export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  viderSelectionCookies();
}

export { COOKIE_NAME };

/* ----------------------- LECTURE COTE SERVEUR ---------------------------- */
// Helper utilisable dans les Server Components Next pour pre-filtrer les
// donnees a la source. On decode le JWT sans verifier la signature : la
// validation crypto reste l'affaire du backend. Si le cookie est absent
// ou corrompu, on renvoie null et la page peut decider de rediriger.

/** Decoded payload du JWT (lecture seule, pas de verif crypto). */
interface JwtPayloadLight {
  sub: string;
  login: string;
  role: "admin" | "referent" | "user" | string;
  clubId?: string;
  equipeIds?: string[];
  exp?: number;
}

/** A appeler depuis un Server Component / fonction async cote serveur. */
export async function getCurrentUserServer(): Promise<JwtPayloadLight | null> {
  if (typeof window !== "undefined") return null;
  try {
    const { cookies } = await import("next/headers");
    const token = cookies().get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = decoderPayloadJwt(token) as JwtPayloadLight | null;
    if (!payload) return null;
    // Verif expiration cote client (defensive, le backend re-controle).
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}
