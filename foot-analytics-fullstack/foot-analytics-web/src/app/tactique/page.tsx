// src/app/tactique/page.tsx
//
// Route /tactique : la page vit dans features/tactique. Fermee sur une saison passee (voir
// features/shell/lib/acces-pages.ts).

import TactiquePage from "@/features/tactique/components/TactiquePage";
import { GardePage } from "@/features/shell/components/GardePage";

export const metadata = { title: "Tactique · Foot Analytics" };

export default function Route() {
  return <GardePage chemin="/tactique" page="Tactique"><TactiquePage /></GardePage>;
}
