// src/app/club/[id]/scouting/page.tsx
//
// Deep-link direct vers l'onglet "Rapport scouting" de la page club : memes
// donnees (filtrees par saison et par equipe) que /club/[id].

import { ClubPageContent } from "@/features/clubs/components/ClubPageContent";

export default function ScoutingPage({ params }: { params: { id: string } }) {
  return <ClubPageContent id={params.id} initialTab="scouting" />;
}
