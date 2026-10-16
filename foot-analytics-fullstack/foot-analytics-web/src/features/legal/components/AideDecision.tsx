// src/features/legal/components/AideDecision.tsx
//
// Mention a cote des statistiques, scores et predictions (onze probable, systeme probable, fatigue, IA) : ce sont des
// indications, jamais une decision. Le choix revient toujours au staff.

import { Info } from "lucide-react";

export function AideDecision({ className = "", texte }: { className?: string; texte?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-[11px] leading-snug text-faint ${className}`} data-testid="aide-decision">
      <Info size={12} className="mt-px shrink-0" aria-hidden />
      <span>{texte ?? "Aide a la decision, non contraignante : une estimation statistique, le choix revient au staff."}</span>
    </p>
  );
}
