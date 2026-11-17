// src/app/matchs/[id]/avant/page.tsx
//
// Route /matchs/[id]/avant : l'avant-match (composition de depart, dispositif, groupe, banc).

import AvantMatchPage from "@/features/avant-match/components/AvantMatchPage";

export const metadata = { title: "Avant-match · Foot Analytics" };

export default async function Route({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ depuis?: string }> }) {
  const { id } = await params;
  const { depuis } = await searchParams;
  // « depuis=direct » : on arrive ici parce que le direct exige l'avant-match.
  return <AvantMatchPage matchId={id} force={depuis === "direct"} />;
}
