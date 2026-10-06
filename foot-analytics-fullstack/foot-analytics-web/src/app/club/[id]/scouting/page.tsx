// src/app/club/[id]/scouting/page.tsx
//
// Deep-link direct vers l'onglet "Rapport scouting" de la page club : memes
// donnees (filtrees par saison et par equipe) que /club/[id]. C'est aussi le troisieme document du dossier d'un club
// (pre-match, analyse d'equipe, scouting) : ses onglets sont rappeles en haut.

import { ClubPageContent } from "@/features/clubs/components/ClubPageContent";
import { getOwnClubIdServer } from "@/features/equipes/lib/own-club";
import { OngletsDossier } from "@/features/rapports/components/OngletsDossier";
import { verdictPage } from "@/features/shell/lib/garde-page";

export default async function ScoutingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [monClubId, prematch] = await Promise.all([getOwnClubIdServer(), verdictPage("/rapports/prematch")]);
  return (
    <div className="space-y-4">
      <OngletsDossier clubId={id} courant="scouting" monClub={id === monClubId} prematchOuvert={prematch.restriction === null} />
      <ClubPageContent id={id} initialTab="scouting" />
    </div>
  );
}
