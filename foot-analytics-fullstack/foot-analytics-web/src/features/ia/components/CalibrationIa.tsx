"use client";
// src/features/ia/components/CalibrationIa.tsx
//
// Les probabilites de l'IA sont-elles justes ? Pour chaque tranche de probabilite annoncee (de 0 a 10 %, de 10 a 20 %...),
// la part des joueurs qui ont reellement commence le match. Un modele bien calibre a deux barres de meme hauteur.

import { pct } from "@/features/ia/lib/ia-format";
import type { BandeCalibration } from "@/features/ia/lib/ia-types";

export function CalibrationIa({ bandes }: { bandes: BandeCalibration[] }) {
  const peuplees = bandes.filter((b) => b.n > 0);
  if (peuplees.length === 0) return null;
  const total = peuplees.reduce((s, b) => s + b.n, 0);
  const ecart = peuplees.reduce((s, b) => s + b.n * Math.abs((b.probaMoyenne ?? 0) - (b.tauxObserve ?? 0)), 0) / total;

  return (
    <div>
      <div className="flex items-end gap-1.5" role="img"
        aria-label={`Calibration : ecart moyen de ${pct(ecart)} entre probabilite annoncee et frequence observee`}>
        {bandes.map((b) => (
          <div key={b.de} className="flex min-w-0 flex-1 flex-col items-center gap-1" data-testid={`calibration-${Math.round(b.de * 100)}`}>
            <div className="flex h-28 w-full items-end justify-center gap-0.5">
              {b.n > 0 ? (
                <>
                  <span className="w-1/2 max-w-[14px] rounded-t bg-accent" style={{ height: `${Math.max(2, (b.probaMoyenne ?? 0) * 100)}%` }}
                    title={`Annonce : ${pct(b.probaMoyenne)}`} />
                  <span className="w-1/2 max-w-[14px] rounded-t bg-win" style={{ height: `${Math.max(2, (b.tauxObserve ?? 0) * 100)}%` }}
                    title={`Observe : ${pct(b.tauxObserve)}`} />
                </>
              ) : <span className="h-px w-full bg-line" />}
            </div>
            <span className="text-[10px] text-faint">{Math.round(b.de * 100)}-{Math.round(b.a * 100)}</span>
            <span className="text-[10px] text-faint">{b.n > 0 ? b.n : ""}</span>
          </div>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <li className="inline-flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-accent" /> Probabilite annoncee</li>
        <li className="inline-flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-win" /> Part reellement titulaire</li>
        <li>Ecart moyen : <span className="font-mono text-ink">{pct(ecart)}</span></li>
      </ul>
    </div>
  );
}
