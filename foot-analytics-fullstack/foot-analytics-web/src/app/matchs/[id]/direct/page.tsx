// src/app/matchs/[id]/direct/page.tsx
//
// Route /matchs/[id]/direct : le direct d'un match (saisie des evenements pendant la rencontre, ou apres coup).

import DirectPage from "@/features/direct/components/DirectPage";

export const metadata = { title: "Direct · Foot Analytics" };

export default async function Route({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DirectPage matchId={id} />;
}
