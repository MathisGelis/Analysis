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
import { decoderPayloadJwt } from "@/lib/jwt";
import { DEFAULT_OWN_CLUB_ID } from "@/lib/club-defaut";

export { DEFAULT_OWN_CLUB_ID };

export function getOwnClubIdServer(): string {
  const all = cookies();
  // 1. JWT du user connecte : si user non-admin avec clubId, on le force.
  const token = all.get("fa_token")?.value;
  if (token) {
    const payload = decoderPayloadJwt(token);
    if (payload && payload.role !== "admin" && payload.clubId) {
      return payload.clubId;
    }
  }
  // 2-4. Cookie / env / default.
  return all.get("ownClubId")?.value ?? DEFAULT_OWN_CLUB_ID;
}
