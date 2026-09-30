// src/components/MotifsCartons.tsx
//
// Detail des motifs des cartons donnes par un arbitre. La somme des lignes (cartons sans motif
// compris) est TOUJOURS le nombre de cartons annonces : on n'affiche jamais "4 cartons" avec
// seulement 2 raisons. Sans detail (statistiques calculees avant cette version), on retombe sur
// le resume court et on le dit.

import { AlertTriangle } from "lucide-react";
import type { DecompteMotifs } from "@/lib/arbitre-portee";

export function MotifsCartons({
  decompte, motifsTop, cartons,
}: { decompte: DecompteMotifs | null; motifsTop: string | null; cartons: number }) {
  if (!decompte) {
    if (!motifsTop) return null;
    return (
      <section className="panel p-5">
        <div className="h-section mb-2 flex items-center gap-2">
          <AlertTriangle size={11} className="text-amber"/>
          Motifs de cartons les plus frequents
        </div>
        <p className="text-sm text-ink">{motifsTop}</p>
        <p className="text-[11px] text-faint mt-1">
          Resume partiel : le detail complet des motifs apparait apres la prochaine reconstruction des statistiques.
        </p>
      </section>
    );
  }
  if (decompte.total === 0) return null;

  const lignes = [
    ...decompte.motifs.map((m) => ({ libelle: m.motif, n: m.n, absent: false })),
    ...(decompte.sansMotif > 0 ? [{ libelle: "Motif non renseigne", n: decompte.sansMotif, absent: true }] : []),
  ];
  const max = Math.max(...lignes.map((l) => l.n));

  return (
    <section className="panel p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="h-section flex items-center gap-2">
          <AlertTriangle size={11} className="text-amber"/>
          Motifs des {decompte.total} carton{decompte.total > 1 ? "s" : ""}
        </h2>
        <span className="text-[11px] text-faint">jaunes et rouges, matchs ou il etait arbitre principal</span>
      </div>
      <ul className="space-y-2">
        {lignes.map((l) => (
          <li key={l.libelle} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_4.5rem]">
            <span className={`truncate text-sm ${l.absent ? "italic text-muted" : "text-ink"}`} title={l.libelle}>{l.libelle}</span>
            <div className="order-3 col-span-2 h-1.5 overflow-hidden rounded-full bg-line sm:order-none sm:col-span-1" aria-hidden>
              <div className={`h-full rounded-full ${l.absent ? "bg-line2" : "bg-accentstrong"}`} style={{ width: `${(l.n / max) * 100}%` }} />
            </div>
            <span className="text-right text-xs tabular-nums text-muted">
              <b className="font-display text-sm text-ink">{l.n}</b> · {Math.round((l.n / decompte.total) * 100)} %
            </span>
          </li>
        ))}
      </ul>
      {decompte.sansMotif > 0 && (
        <p className="mt-3 text-[11px] text-faint">
          Pour {decompte.sansMotif} carton{decompte.sansMotif > 1 ? "s" : ""}, la feuille de match ne precise pas le motif.
        </p>
      )}
      {decompte.total !== cartons && (
        <p className="mt-2 text-[11px] text-amber">
          Ce detail couvre {decompte.total} carton{decompte.total > 1 ? "s" : ""} sur les {cartons} annonces : relancer la reconstruction des statistiques.
        </p>
      )}
    </section>
  );
}
