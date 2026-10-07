// src/app/saisons/page.tsx
//
// Route /saisons : la page vit dans features/saisons. Reservee a l'administrateur (voir
// features/shell/lib/acces-pages.ts ; les ecritures sont de toute facon refusees par l'API).

import SaisonsPage from "@/features/saisons/components/SaisonsPage";
import { GardePage } from "@/features/shell/components/GardePage";

export const metadata = { title: "Saisons · Foot Analytics" };

export default function Route() {
  return <GardePage chemin="/saisons" page="Saisons"><SaisonsPage /></GardePage>;
}
