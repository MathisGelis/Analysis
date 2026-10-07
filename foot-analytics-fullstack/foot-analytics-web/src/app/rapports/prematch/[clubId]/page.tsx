// src/app/rapports/prematch/[clubId]/page.tsx
//
// Route /rapports/prematch/[clubId] : la page vit dans features/prematch. Fermee sur une saison passee (voir
// features/shell/lib/acces-pages.ts) : il n'y a pas de prochain match a preparer.

import RapportPrematch from "@/features/prematch/components/RapportPrematchPage";
import { GardePage } from "@/features/shell/components/GardePage";

export const metadata = { title: "Rapport pre-match · Foot Analytics" };

export default function Route(props: React.ComponentProps<typeof RapportPrematch>) {
  return <GardePage chemin="/rapports/prematch" page="Rapport pre-match"><RapportPrematch {...props} /></GardePage>;
}
