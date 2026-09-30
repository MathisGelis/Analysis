// src/components/analyse/DisciplineCard.tsx
//
// Cartons : total, rythme par match (recent contre avant) et repartition par tranche de
// 15 minutes quand la feuille de match donne la minute.

import type { Tendances } from "@/lib/analyse-types";
import { decimal } from "@/lib/tendances-format";

const TRANCHES = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90+"];

export function DisciplineCard({
  discipline: d, matchs, large = false,
}: { discipline: Tendances["discipline"]; matchs: number; large?: boolean }) {
  const max = Math.max(...d.parTranche, 1);
  return (
    <div className={large ? "grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "space-y-4"}>
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-tile !p-3">
          <div className="stat-label">Jaunes</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-amber">{d.jaunes}</div>
          <div className="text-[11px] text-faint">{decimal(d.jaunesParMatch)} / match</div>
        </div>
        <div className="stat-tile !p-3">
          <div className="stat-label">Rouges</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-danger">{d.rouges}</div>
          <div className="text-[11px] text-faint">sur {matchs} matchs</div>
        </div>
        <div className="stat-tile !p-3">
          <div className="stat-label">Rythme</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{decimal(d.recentJaunesParMatch)}</div>
          <div className="text-[11px] text-faint">recent, contre {decimal(d.avantJaunesParMatch)}</div>
        </div>
      </div>

      {d.cartonsAvecMinute >= 5 ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="h-section">Par tranche de 15 minutes</span>
            {d.partFinDeMatch !== null && (
              <span className="text-[11px] text-muted">{Math.round(d.partFinDeMatch * 100)} % apres la 75e</span>
            )}
          </div>
          <div className="flex h-24 items-end gap-2" role="img"
            aria-label={`Cartons par tranche : ${TRANCHES.map((t, i) => `${t} min ${d.parTranche[i]}`).join(", ")}`}>
            {d.parTranche.map((n, i) => (
              <div key={TRANCHES[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] tabular-nums text-muted">{n || ""}</span>
                <div className="w-full max-w-[26px] rounded-t-md bg-amber/80" style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 64)}px`, opacity: n ? 1 : 0.35 }} />
                <span className="text-[10px] text-faint">{TRANCHES[i]}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-faint">Les feuilles ne donnent pas assez de minutes de cartons pour les repartir par tranche.</p>
      )}
    </div>
  );
}
