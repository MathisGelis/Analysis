// src/features/equipes/lib/own-club.ts
//
// Identifiant du club "proprietaire" (celui que le coach entraine), cote serveur.
//
// Priorite :
//  1. Si l'utilisateur connecte n'est pas admin ET a un clubId dans son jeton, on force ce clubId (impossible de
//     contourner via le cookie ownClubId).
//  2. Sinon (admin ou pas de jeton) : cookie ownClubId
//  3. Sinon : env NEXT_PUBLIC_CLUB_ID
//  4. Sinon : "chapo"
//
// A utiliser uniquement dans les Server Components / Route Handlers.
// Pour les Client Components, utiliser `useOwnClubId()` du contexte.

import { cookies } from "next/headers";

import { getCurrentUserServer } from "@/features/auth/lib/auth";

import { DEFAULT_OWN_CLUB_ID } from "./club-defaut";

export async function getOwnClubIdServer(): Promise<string> {
  const payload = await getCurrentUserServer();
  if (payload && payload.role !== "admin" && payload.clubId) return payload.clubId;
  return (await cookies()).get("ownClubId")?.value ?? DEFAULT_OWN_CLUB_ID;
}
