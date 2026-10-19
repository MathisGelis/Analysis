// src/features/auth/lib/auth.ts
//
// Session cote front. Les jetons ne sont JAMAIS accessibles au JavaScript de la page : ils vivent dans des cookies
// HttpOnly poses par le serveur Next (voir session-serveur.ts). Le navigateur ne connait que le profil de
// l'utilisateur, fourni par le layout (contexte, voir session-context.tsx).

import { decoderPayloadJwt, type JwtPayload } from "./jwt";

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
  /** Version des conditions d'utilisation acceptee (null : jamais). */
  cguVersion?: string | null;
}

// Anciennes cles de stockage (jeton et profil en clair) : effacees au chargement, voir oublierAncienStockage.
const ANCIENNES_CLES = ["fa.token", "fa.user"];

/** Cote client : efface les traces de l'ancien stockage du jeton (localStorage), s'il en reste. */
export function oublierAncienStockage(): void {
  if (typeof window === "undefined") return;
  try { for (const cle of ANCIENNES_CLES) localStorage.removeItem(cle); } catch { /* stockage indisponible */ }
}

/** Cote client : ferme la session (ou toutes les sessions du compte) puis retourne a l'ecran de connexion. */
export async function deconnecter(partout = false): Promise<void> {
  try {
    await fetch(`/api/session/logout${partout ? "?partout=1" : ""}`, { method: "POST" });
  } finally {
    oublierAncienStockage();
    window.location.href = "/login";
  }
}

/* ----------------------- LECTURE COTE SERVEUR ---------------------------- */
// Pour les Server Components : le payload du jeton d'acces (cookie HttpOnly), decode SANS verifier la signature. La
// validation cryptographique reste l'affaire du backend ; ceci ne sert qu'a l'affichage et aux redirections.

/** A appeler depuis un Server Component / fonction async cote serveur. Null : pas de session. */
export async function getCurrentUserServer(): Promise<JwtPayload | null> {
  if (typeof window !== "undefined") return null;
  try {
    const { cookies } = await import("next/headers");
    const { COOKIE_ACCES } = await import("./session-serveur");
    const token = (await cookies()).get(COOKIE_ACCES)?.value;
    if (!token) return null;
    const payload = decoderPayloadJwt(token);
    if (!payload) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}
