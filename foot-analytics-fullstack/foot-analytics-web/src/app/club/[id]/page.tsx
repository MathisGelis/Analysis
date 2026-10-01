// src/app/club/[id]/page.tsx
//
// Page club a onglets : Vue d'ensemble, Effectif, Matchs, Rapport scouting.
// Le chargement des donnees est dans club-page.tsx (partage avec /scouting).

import { ClubPageContent } from "@/features/clubs/components/ClubPageContent";

export default function ClubPage({ params }: { params: { id: string } }) {
  return <ClubPageContent id={params.id} initialTab="overview" />;
}
