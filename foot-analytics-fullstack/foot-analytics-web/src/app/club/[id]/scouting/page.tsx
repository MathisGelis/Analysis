// src/app/club/[id]/scouting/page.tsx
//
// Deep-link direct vers l'onglet "Rapport scouting" de la page club : memes
// donnees (filtrees par saison et par equipe) que /club/[id].

import { ClubPageContent } from "@/features/clubs/components/ClubPageContent";

export default async function ScoutingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClubPageContent id={id} initialTab="scouting" />;
}
