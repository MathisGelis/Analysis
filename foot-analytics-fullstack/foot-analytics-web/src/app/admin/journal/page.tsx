// src/app/admin/journal/page.tsx
//
// Route /admin/journal : journal d'audit, reserve a l'administrateur (voir features/shell/lib/acces-pages.ts).

import JournalPage from "@/features/audit/components/JournalPage";
import { GardePage } from "@/features/shell/components/GardePage";

export const metadata = { title: "Journal d'audit · Foot Analytics" };

export default function Route() {
  return <GardePage chemin="/admin/journal" page="Journal d'audit"><JournalPage /></GardePage>;
}
