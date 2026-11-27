"use client";

// src/features/direct/components/BandeauAlertes.tsx
//
// Les alertes du direct, en bandeau sous le tableau de marque : visibles sur tous les onglets (on n'est pas toujours sur la compo). Chaque
// alerte se ferme d'un geste ; elle ne revient que si la situation s'aggrave (son identifiant change, voir lib/alertes-direct.ts).

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import type { AlerteDirect } from "../lib/alertes-direct";

const MAX = 3;

export function BandeauAlertes({ alertes }: { alertes: AlerteDirect[] }) {
  const [fermees, setFermees] = useState<ReadonlySet<string>>(new Set());
  const visibles = alertes.filter((a) => !fermees.has(a.id));
  if (visibles.length === 0) return null;
  const montrees = [...visibles].sort((a, b) => Number(b.niveau === "alerte") - Number(a.niveau === "alerte")).slice(0, MAX);
  return (
    <section aria-label="Alertes du match" role="status" className="space-y-1.5" data-testid="bandeau-alertes">
      {montrees.map((a) => (
        <div key={a.id} className={`flex items-start gap-2.5 rounded-xl border bg-surface px-3 py-2 ${a.niveau === "alerte" ? "border-danger/60" : "border-amber/60"}`}>
          <AlertTriangle size={16} aria-hidden className={`mt-0.5 shrink-0 ${a.niveau === "alerte" ? "text-danger" : "text-amber"}`} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{a.titre}</div>
            <div className="text-[13px] text-muted">{a.detail}</div>
          </div>
          <button type="button" aria-label={`Fermer l'alerte : ${a.titre}`} onClick={() => setFermees((f) => new Set([...f, a.id]))} className="btn !h-9 !w-9 shrink-0 !p-0"><X size={14} aria-hidden /></button>
        </div>
      ))}
      {visibles.length > MAX && <p className="text-xs text-muted">+ {visibles.length - MAX} autre{visibles.length - MAX > 1 ? "s" : ""} alerte{visibles.length - MAX > 1 ? "s" : ""}</p>}
    </section>
  );
}
