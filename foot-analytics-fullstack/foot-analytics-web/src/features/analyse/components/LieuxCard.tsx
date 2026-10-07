// src/features/analyse/components/LieuxCard.tsx
//
// Domicile contre exterieur, ecart de points par match.

import type { Tendances } from "@/features/analyse/lib/analyse-types";
import { decimal } from "@/features/analyse/lib/tendances-format";

import { BilanBarre } from "./BilanBarre";

export function LieuxCard({ lieux }: { lieux: Tendances["lieux"] }) {
  const { domicile, exterieur, ecartPpm } = lieux;
  return (
    <div className="space-y-4">
      <BilanBarre titre="A domicile" bilan={domicile} />
      <BilanBarre titre="A l'exterieur" bilan={exterieur} />
      {ecartPpm !== null && Math.abs(ecartPpm) >= 0.4 && (
        <p className="rounded-lg bg-panel2 px-3 py-2 text-xs text-muted">
          {ecartPpm > 0 ? "Plus solide a domicile" : "Plus solide a l'exterieur"} : {decimal(Math.abs(ecartPpm), 2)} point par match d'ecart.
        </p>
      )}
    </div>
  );
}
