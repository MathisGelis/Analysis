// src/app/matchs/[id]/apres/page.tsx
//
// Route /matchs/[id]/apres : l'apres-match (notes des joueurs, arbitre, blessures, bilan).

import ApresMatchPage from "@/features/apres-match/components/ApresMatchPage";

export const metadata = { title: "Après-match · Foot Analytics" };

export default async function Route({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApresMatchPage matchId={id} />;
}
