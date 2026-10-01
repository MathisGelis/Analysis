// src/app/club/[id]/page.tsx
//
// Page club a onglets : Vue d'ensemble, Effectif, Matchs, Rapport scouting.
// Le chargement des donnees est dans club-page.tsx (partage avec /scouting).

import { ClubPageContent } from "@/features/clubs/components/ClubPageContent";

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClubPageContent id={id} initialTab="overview" />;
}
