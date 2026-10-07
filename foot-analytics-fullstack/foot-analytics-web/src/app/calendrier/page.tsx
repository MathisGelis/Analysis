// src/app/calendrier/page.tsx
//
// Route /calendrier : la page vit dans features/calendrier. Fermee sur une saison passee (voir
// features/shell/lib/acces-pages.ts).

import CalendrierPage from "@/features/calendrier/components/CalendrierPage";
import { GardePage } from "@/features/shell/components/GardePage";

export const metadata = { title: "Calendrier · Foot Analytics" };

export default function Route() {
  return <GardePage chemin="/calendrier" page="Calendrier"><CalendrierPage /></GardePage>;
}
