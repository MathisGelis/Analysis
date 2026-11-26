// src/features/analyse-jeu/components/CageTirs.tsx
//
// La cage vue de face (2 rangees x 3 colonnes) : ou vont les tirs cadres, et lesquels sont des buts. Seuls les tirs dont la zone du
// cadre a ete saisie y figurent ; le nombre de ceux qui n'en ont pas est dit sous la cage.

import { intensite } from "../lib/affichage-jeu";
import { NOMS_CAGE } from "../lib/tirs-carte";

export function CageTirs({ cage, nom, hauteur = 110 }: { cage: { tirs: number[]; buts: number[]; sansZone: number }; nom: string; hauteur?: number }) {
  const total = cage.tirs.reduce((s, x) => s + x, 0), buts = cage.buts.reduce((s, x) => s + x, 0);
  return (
    <div>
      <div className="relative mx-auto w-full max-w-[260px]" role="img"
        aria-label={`${nom} : ${total} tir${total > 1 ? "s" : ""} placé${total > 1 ? "s" : ""} dans la cage, dont ${buts} but${buts > 1 ? "s" : ""}. ${NOMS_CAGE.map((z, i) => `${z} ${cage.tirs[i]}`).join(", ")}.`}>
        <div className="grid grid-cols-3 grid-rows-2 overflow-hidden rounded-t-md border-[3px] border-b-0" style={{ height: hauteur, borderColor: "rgb(var(--terrain-trace) / 0.9)", backgroundColor: "rgb(var(--terrain))" }} aria-hidden>
          {cage.tirs.map((n, i) => {
            const force = intensite(n, cage.tirs);
            return (
              <div key={i} title={`Cage ${NOMS_CAGE[i]}`} className={`flex flex-col items-center justify-center border text-xs font-bold ${force > 0.5 ? "sur-accent" : "text-ink"}`}
                style={{ borderColor: "rgb(var(--terrain-ligne))", backgroundColor: n ? `rgb(var(--accent-strong) / ${0.15 + 0.75 * force})` : "transparent" }}>
                {n > 0 && <span>{n}</span>}
                {cage.buts[i] > 0 && <span className="text-[10px] font-semibold">⚽ {cage.buts[i]}</span>}
              </div>
            );
          })}
        </div>
        <div className="h-1 rounded-b" style={{ backgroundColor: "rgb(var(--terrain-trace) / 0.9)" }} aria-hidden />
      </div>
      {cage.sansZone > 0 && <p className="mt-1 text-center text-[11px] text-faint">{cage.sansZone} tir{cage.sansZone > 1 ? "s" : ""} cadré{cage.sansZone > 1 ? "s" : ""} sans zone de cage saisie.</p>}
    </div>
  );
}
