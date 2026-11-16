// src/app/saisie/page.tsx
//
// Route publique /saisie : le saisisseur invite retrouve son direct (sa session est sur son appareil).

import { SaisieInvitePage } from "@/features/direct/components/SaisieInvitePage";

export const metadata = { title: "Saisie invitée · Foot Analytics", robots: { index: false, follow: false } };

export default function Route() {
  return <SaisieInvitePage />;
}
