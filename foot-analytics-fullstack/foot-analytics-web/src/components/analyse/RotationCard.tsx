// src/components/analyse/RotationCard.tsx
//
// Rotation du onze : nombre de titulaires differents d'un match a l'autre, avec la
// tendance recente, et la stabilite par ligne calculee par le rapport.

import { Shield } from "lucide-react";
import type { Tendances } from "@/lib/analyse-types";
import { decimal } from "@/lib/tendances-format";
import { PastilleSens } from "./PastilleSens";

const LIGNE_LABEL: Record<string, string> = { GB: "Gardiens", DEF: "Defense", MIL: "Milieu", ATT: "Attaque" };

export function RotationCard({
  rotation, stabilite,
}: {
  rotation: Tendances["rotation"];
  stabilite: { global: number; parLigne: { ligne: string; stabilite: number; effectifUtilise: number; rotations: number }[] };
}) {
  const valeurs = rotation.changements.filter((c): c is number => c !== null);
  const max = Math.max(...valeurs, 1);
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted">
            <b className="font-display text-lg text-ink tabular-nums">{decimal(rotation.moyenne)}</b> titulaires changes en moyenne
          </div>
          {valeurs.length >= 6 && <PastilleSens sens={rotation.sens} inverse />}
        </div>
        {valeurs.length > 0 && (
          <div className="flex h-16 items-end gap-[3px]" role="img"
            aria-label={`Titulaires changes d'un match a l'autre : ${valeurs.join(", ")}`}>
            {valeurs.map((v, i) => (
              <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: "rgb(var(--chart-1))", opacity: i >= valeurs.length - 5 ? 1 : 0.5 }} title={`${v} changement(s)`} />
            ))}
          </div>
        )}
        <div className="mt-1 flex justify-between text-[10px] text-faint"><span>Debut de saison</span><span>Dernier match</span></div>
      </div>

      <div>
        <div className="h-section mb-2 flex items-center gap-2"><Shield size={11} className="text-accent" />Stabilite ({stabilite.global} / 100)</div>
        <ul className="space-y-2">
          {stabilite.parLigne.map((s) => (
            <li key={s.ligne} className="flex items-center gap-3">
              <span className="w-16 text-[11px] uppercase tracking-wider text-faint">{LIGNE_LABEL[s.ligne] ?? s.ligne}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className={`h-full rounded-full ${s.stabilite >= 70 ? "bg-accentstrong" : s.stabilite >= 40 ? "bg-amber" : "bg-danger"}`} style={{ width: `${s.stabilite}%` }} />
              </div>
              <span className="w-7 text-right text-xs tabular-nums">{s.stabilite}</span>
              <span className="hidden w-28 text-right text-[10px] text-faint sm:block">{s.effectifUtilise} joueurs · {s.rotations} rotations</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
