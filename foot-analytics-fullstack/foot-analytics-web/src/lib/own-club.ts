// src/lib/own-club.ts
//
// Identifiant du club "proprietaire" (celui que le coach entraine), cote serveur.
//
// Priorite :
//  1. Si l'utilisateur connecte est un user (role != admin) ET a un
//     clubId dans son JWT, on force ce clubId (impossible de
//     contourner via le cookie ownClubId).
//  2. Sinon (admin ou pas de JWT) : cookie ownClubId
//  3. Sinon : env NEXT_PUBLIC_CLUB_ID
//  4. Sinon : "chapo"
//
// A utiliser uniquement dans les Server Components / Route Handlers.
// Pour les Client Components, utiliser `useOwnClubId()` du contexte.

import { cookies } from "next/headers";

export const DEFAULT_OWN_CLUB_ID =
  process.env.NEXT_PUBLIC_CLUB_ID ?? "chapo";

/**
 * Decode le payload JWT (base64) sans verifier la signature.
 * Utilise en lecture seule pour pre-filtrer cote UX ; la verification
 * crypto reste l'affaire du backend. Sync pour ne pas casser les
 * appelants (signature compatible).
 */
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch { return null; }
}

export function getOwnClubIdServer(): string {
  const all = cookies();
  // 1. JWT du user connecte : si user non-admin avec clubId, on le force.
  const token = all.get("fa_token")?.value;
  if (token) {
    const payload = decodeJwtPayload(token);
    if (payload && payload.role !== "admin" && payload.clubId) {
      return payload.clubId;
    }
  }
  // 2-4. Cookie / env / default.
  return all.get("ownClubId")?.value ?? DEFAULT_OWN_CLUB_ID;
}
