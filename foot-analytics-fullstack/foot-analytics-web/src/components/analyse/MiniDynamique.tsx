// src/components/analyse/MiniDynamique.tsx
//
// Forme recente et sens de la tendance d'une equipe, en une ligne, pour les cartes de
// scouting. `compact` garde la seule pastille de tendance (cartes etroites).

import { FormeStrip } from "@/components/Charts";
import type { DynamiqueEquipe } from "@/lib/analyse-types";
import { PastilleSens } from "./PastilleSens";

export function MiniDynamique({ equipe, compact = false }: { equipe: DynamiqueEquipe; compact?: boolean }) {
  const jugee = equipe.sens !== "insuffisant";
  if (compact && !jugee) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {!compact && equipe.formeRecente.length > 0 && <FormeStrip values={equipe.formeRecente} />}
      {jugee && <PastilleSens sens={equipe.sens} />}
    </div>
  );
}
