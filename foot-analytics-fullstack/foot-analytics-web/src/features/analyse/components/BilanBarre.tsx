// src/features/analyse/components/BilanBarre.tsx
//
// Ligne de bilan : V-N-D, une barre de points par match (echelle 0 a 3) et les buts.
// Sert aux cartes domicile/exterieur et niveau des adversaires.

import type { Bilan } from "@/features/analyse/lib/analyse-types";
import { decimal } from "@/features/analyse/lib/tendances-format";

export function BilanBarre({ titre, sousTitre, bilan }: { titre: string; sousTitre?: string; bilan: Bilan }) {
  const part = Math.min(1, bilan.ppm / 3);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-ink">{titre}</span>
          {sousTitre && <span className="ml-2 text-[11px] text-faint">{sousTitre}</span>}
        </div>
        <div className="shrink-0 text-xs tabular-nums text-muted">
          <span className="text-win">{bilan.v}V</span> <span className="text-draw">{bilan.n}N</span> <span className="text-loss">{bilan.d}D</span>
          <span className="ml-2 text-faint">{bilan.bp}-{bilan.bc}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="img"
          aria-label={`${decimal(bilan.ppm, 2)} points par match sur ${bilan.joues} matchs`}>
          <div className="h-full rounded-full bg-accentstrong" style={{ width: `${part * 100}%` }} />
        </div>
        <span className="w-20 shrink-0 text-right font-display text-sm font-bold tabular-nums text-ink">
          {decimal(bilan.ppm, 2)} <span className="text-[10px] font-medium text-faint">pt/m</span>
        </span>
      </div>
      <div className="text-[11px] text-faint">{bilan.joues} match{bilan.joues > 1 ? "s" : ""}</div>
    </div>
  );
}
