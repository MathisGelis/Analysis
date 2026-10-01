// src/features/equipes/lib/club-defaut.ts
//
// Club "proprietaire" par defaut quand ni le JWT ni le cookie ownClubId ne le
// designent : NEXT_PUBLIC_CLUB_ID, sinon "chapo". Module pur (pas de
// next/headers) pour etre importable depuis le middleware edge.

export const DEFAULT_OWN_CLUB_ID: string =
  process.env.NEXT_PUBLIC_CLUB_ID ?? "chapo";
