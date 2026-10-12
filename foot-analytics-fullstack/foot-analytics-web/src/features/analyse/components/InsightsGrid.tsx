// src/features/analyse/components/InsightsGrid.tsx
//
// "Ce qu'il faut retenir" : les constats ecrits par le moteur de tendances, les plus
// importants d'abord. Un liseré de couleur donne le ton (bon signe / a surveiller / neutre).

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import type { Insight } from "@/features/analyse/lib/analyse-types";

const CATEGORIE: Record<Insight["categorie"], string> = {
  forme: "Forme", attaque: "Attaque", defense: "Defense", domicile: "Lieu",
  discipline: "Discipline", effectif: "Effectif", adversaires: "Adversaires",
};

const TON = {
  positif: { bord: "border-l-win", puce: "bg-win/15 text-win", Icone: CheckCircle2 },
  negatif: { bord: "border-l-loss", puce: "bg-loss/15 text-loss", Icone: AlertTriangle },
  neutre: { bord: "border-l-line2", puce: "bg-panel3 text-muted", Icone: Info },
} as const;

export function InsightsGrid({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  const tries = [...insights].sort((a, b) => b.importance - a.importance);
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {tries.map((i) => {
        const { bord, puce, Icone } = TON[i.ton];
        return (
          <li key={i.id} className={`panel-inset flex items-start gap-3 border-l-[3px] p-3.5 ${bord}`}>
            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${puce}`}><Icone size={15} aria-hidden /></span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-snug text-ink">{i.titre}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{i.detail}</p>
              <span className="mt-1.5 inline-block text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{CATEGORIE[i.categorie]}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
