// src/app/admin/ia/page.tsx
//
// Route /admin/ia : la page vit dans features/ia. Reservee a l'administrateur (voir features/shell/lib/acces-pages.ts).

import IaPage from "@/features/ia/components/IaPage";
import { GardePage } from "@/features/shell/components/GardePage";

export const metadata = { title: "IA · Foot Analytics" };

export default function Route() {
  return <GardePage chemin="/admin/ia" page="Intelligence artificielle"><IaPage /></GardePage>;
}
