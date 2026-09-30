"use client";
// src/components/ClubNom.tsx
//
// Nom d'un club a partir de son identifiant (contexte des clubs charge par la coquille). Utilisable dans
// un Server Component : seul ce petit morceau lit le contexte.

import { useClub } from "@/lib/clubs-context";

export function ClubNom({ clubId }: { clubId: string | null | undefined }) {
  const club = useClub(clubId);
  return <>{club?.nom ?? "Club inconnu"}</>;
}
