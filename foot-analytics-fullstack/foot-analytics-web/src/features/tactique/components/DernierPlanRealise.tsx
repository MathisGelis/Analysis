"use client";
// src/features/tactique/components/DernierPlanRealise.tsx
//
// Carte de l'onglet Tactique : le dernier match joue pour lequel un plan avait ete prepare, compare a
// la feuille. Le detail complet est sur la fiche du match.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";

import { api } from "@/shared/lib/api";
import { useClub } from "@/features/clubs/lib/clubs-context";
import type { PlanContreRealise } from "@/features/tactique/lib/plan-realise-types";
import { DonutStat } from "@/shared/ui/Charts";

const TON = { atout: "text-win", vigilance: "text-loss", info: "text-muted" } as const;
const couleur = (n: number) => (n >= 80 ? "rgb(var(--win))" : n >= 60 ? "rgb(var(--amber))" : "rgb(var(--danger))");

export function DernierPlanRealise({ equipeId }: { equipeId: string }) {
  const [donnees, setDonnees] = useState<PlanContreRealise | null>(null);
  useEffect(() => {
    let annule = false;
    setDonnees(null);
    api.planContreRealise(equipeId).then((d) => { if (!annule) setDonnees(d); }).catch(() => undefined);
    return () => { annule = true; };
  }, [equipeId]);
  const adversaire = useClub(donnees?.match?.adversaireClubId ?? "");

  const c = donnees?.comparaison;
  if (!donnees || !donnees.match || !c || c.etat !== "ok") return null;
  const m = donnees.match;
  return (
    <section className="panel p-5" aria-labelledby="dernier-plan-realise">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="dernier-plan-realise" className="h-section flex items-center gap-2"><ClipboardCheck size={11} className="text-accent" />Dernier plan, contre realise</h2>
        <span className="text-[11px] text-faint">{m.date ?? ""}</span>
      </div>
      <div className="flex items-center gap-4">
        {c.adequation !== null && <DonutStat value={c.adequation} size={64} stroke={7} color={couleur(c.adequation)} label="%" />}
        <div className="min-w-0 text-xs text-muted">
          <div className="truncate text-sm font-semibold text-ink">{m.domicile ? "vs" : "@"} {adversaire?.nom ?? "adversaire"} · {m.buts}-{m.butsAdversaire}</div>
          {c.adequation !== null && <div>{c.titulairesConformes} / {c.titulairesPrevus} titulaires comme prevu</div>}
        </div>
      </div>
      {c.observations.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {c.observations.slice(0, 2).map((o) => (
            <li key={o.titre} className={TON[o.ton]}><b className="font-semibold">{o.titre}.</b> <span className="text-muted">{o.detail}</span></li>
          ))}
        </ul>
      )}
      <Link href={`/matchs/${m.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
        Voir le detail <ArrowRight size={12} aria-hidden />
      </Link>
    </section>
  );
}
