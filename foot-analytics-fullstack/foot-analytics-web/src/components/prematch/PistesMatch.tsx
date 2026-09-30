// src/components/prematch/PistesMatch.tsx
//
// "Pistes pour le match" : ce que le staff peut exploiter (atouts) et ce dont il doit se meifer
// (vigilances). Chaque piste cite son chiffre ; le liseré de couleur donne le ton.

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { Piste } from "@/lib/prematch-types";

const TON = {
  atout: { bord: "border-l-win", puce: "bg-win/15 text-win", Icone: CheckCircle2, libelle: "A exploiter" },
  vigilance: { bord: "border-l-loss", puce: "bg-loss/15 text-loss", Icone: AlertTriangle, libelle: "Vigilance" },
  info: { bord: "border-l-line2", puce: "bg-panel3 text-muted", Icone: Info, libelle: "A savoir" },
} as const;

export function PistesMatch({ pistes }: { pistes: Piste[] }) {
  if (pistes.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {pistes.map((p, i) => {
        const { bord, puce, Icone, libelle } = TON[p.ton];
        return (
          <li key={`${i}-${p.titre}`} className={`panel-inset no-coupure flex items-start gap-3 border-l-[3px] p-3.5 ${bord}`}>
            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${puce}`}><Icone size={15} aria-hidden /></span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-snug text-ink">{p.titre}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{p.detail}</p>
              <span className="mt-1.5 inline-block text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{libelle}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
