// src/app/matchs/[id]/avant/page.tsx
//
// Route /matchs/[id]/avant : l'avant-match (composition de depart, dispositif, groupe, banc).

import AvantMatchPage from "@/features/avant-match/components/AvantMatchPage";

export const metadata = { title: "Avant-match · Foot Analytics" };

export default async function Route({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AvantMatchPage matchId={id} />;
}
