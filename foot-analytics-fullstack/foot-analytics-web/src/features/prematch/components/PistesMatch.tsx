// src/features/prematch/components/PistesMatch.tsx
//
// "Pistes pour le match" : ce que le staff peut exploiter (atouts) et ce dont il doit se mefier
// (vigilances). Chaque piste cite son chiffre ; le liseré de couleur donne le ton.

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import type { Piste } from "@/features/prematch/lib/prematch-types";

const TON = {
  atout: { bord: "border-l-win", puce: "bg-win/15 text-win", Icone: CheckCircle2 },
  vigilance: { bord: "border-l-loss", puce: "bg-loss/15 text-loss", Icone: AlertTriangle },
  info: { bord: "border-l-line2", puce: "bg-panel3 text-muted", Icone: Info },
} as const;

/** Libelle du pied de carte, selon le ton : avant le match (pistes) ou apres (plan contre realise). */
const LIBELLES = {
  prematch: { atout: "A exploiter", vigilance: "Vigilance", info: "A savoir" },
  plan: { atout: "Conforme", vigilance: "A regarder", info: "Constat" },
} as const;

export function PistesMatch({ pistes, variante = "prematch" }: { pistes: Piste[]; variante?: keyof typeof LIBELLES }) {
  if (pistes.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {pistes.map((p, i) => {
        const { bord, puce, Icone } = TON[p.ton];
        const libelle = LIBELLES[variante][p.ton];
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
