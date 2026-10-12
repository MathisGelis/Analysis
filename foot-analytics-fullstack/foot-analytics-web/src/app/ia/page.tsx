// src/app/ia/page.tsx
//
// Ancienne page "Predictions" : les predictions (projection du resultat, systeme et onze probables) font maintenant partie du
// rapport pre-match, ouvert depuis /rapports. Un ancien lien `?adversaire=<clubId>` ouvre le pre-match de ce club.

import { redirect } from "next/navigation";

export default async function Predictions({ searchParams }: { searchParams?: Promise<{ adversaire?: string }> }) {
  const { adversaire } = (await searchParams) ?? {};
  redirect(adversaire ? `/rapports/prematch/${encodeURIComponent(adversaire)}` : "/rapports");
}
