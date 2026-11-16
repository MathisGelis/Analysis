// src/app/saisie/[jeton]/page.tsx
//
// Route publique /saisie/[jeton] : l'ouverture du lien d'invitation d'un saisisseur (une seule fois).

import { SaisieInvitePage } from "@/features/direct/components/SaisieInvitePage";

export const metadata = { title: "Saisie invitée · Foot Analytics", robots: { index: false, follow: false } };

export default async function Route({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  return <SaisieInvitePage jeton={jeton} />;
}
