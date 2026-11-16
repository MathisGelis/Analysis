"use client";

// src/features/direct/components/TerrainZones.tsx
//
// Le terrain en 5 couloirs x 3 tiers (l'attaque est en haut) pour pointer d'ou part un tir, une faute, un corner. Et le cadre :
// 6 cases (haut / bas x gauche, centre, droit) pour dire ou le ballon est entre ou a ete arrete.

import { nomCadre, nomZone, NB_CADRES, NB_COULOIRS, NB_TIERS } from "../lib/actions";

export function TerrainZones({
  tier, couloir, onChoisir,
}: { tier: number | null; couloir: number | null; onChoisir: (tier: number | null, couloir: number | null) => void }) {
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2" style={{ height: 176, borderColor: "rgb(var(--terrain-ligne))", backgroundColor: "rgb(var(--terrain))" }}>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${NB_COULOIRS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${NB_TIERS}, minmax(0, 1fr))` }}>
          {Array.from({ length: NB_TIERS * NB_COULOIRS }, (_, i) => {
            const t = Math.floor(i / NB_COULOIRS), c = i % NB_COULOIRS;
            const choisi = t === tier && c === couloir;
            return (
              <button key={i} type="button" aria-label={nomZone(t, c)} aria-pressed={choisi}
                onClick={() => (choisi ? onChoisir(null, null) : onChoisir(t, c))}
                style={{ borderColor: "rgb(var(--terrain-ligne))" }}
                className={`border text-xs font-bold transition-colors ${choisi ? "bg-accentstrong sur-accent" : t === 0 ? "bg-accentstrong/30 hover:bg-accentstrong/50" : "hover:bg-accentstrong/25"}`}>
                {choisi ? "Ici" : ""}
              </button>
            );
          })}
        </div>
        {/* Surface et but de l'equipe qui attaque, traces au-dessus de la grille */}
        <div className="pointer-events-none absolute inset-x-[20%] top-0 h-[34%] border-[3px] border-t-0" style={{ borderColor: "rgb(var(--terrain-trace) / 0.85)" }} />
        <div className="pointer-events-none absolute inset-x-[38%] top-0 h-2.5 border-[3px] border-t-0" style={{ borderColor: "rgb(var(--terrain-trace) / 0.95)" }} />
      </div>
      <div className="mt-1 flex justify-between px-1 text-[11px] text-faint" aria-hidden>
        <span>Gauche</span><span>Axe g.</span><span>Centre</span><span>Axe d.</span><span>Droit</span>
      </div>
    </div>
  );
}

export function CadreBut({ valeur, onChoisir }: { valeur: number | null; onChoisir: (i: number | null) => void }) {
  return (
    <div className="w-36">
      <div className="grid grid-cols-3 gap-[3px] rounded-t border-2 border-b-0 border-ink/80 p-1">
        {Array.from({ length: NB_CADRES }, (_, i) => (
          <button key={i} type="button" aria-label={nomCadre(i)} aria-pressed={valeur === i} onClick={() => onChoisir(valeur === i ? null : i)}
            className={`h-7 rounded border transition-colors ${valeur === i ? "border-accent bg-accent" : "border-line bg-surface-2 hover:bg-surface-3"}`} />
        ))}
      </div>
    </div>
  );
}
