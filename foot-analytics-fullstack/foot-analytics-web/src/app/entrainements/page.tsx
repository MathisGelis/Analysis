// src/app/entrainements/page.tsx
//
// Route /entrainements : la page vit dans features/entrainements. Fermee sur une saison passee (voir
// features/shell/lib/acces-pages.ts).

import EntrainementsPage from "@/features/entrainements/components/EntrainementsPage";
import { GardePage } from "@/features/shell/components/GardePage";

export const metadata = { title: "Entrainements · Foot Analytics" };

export default function Route() {
  return <GardePage chemin="/entrainements" page="Entrainements"><EntrainementsPage /></GardePage>;
}
