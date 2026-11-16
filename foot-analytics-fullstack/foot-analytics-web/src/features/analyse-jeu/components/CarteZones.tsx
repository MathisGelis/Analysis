// src/features/analyse-jeu/components/CarteZones.tsx
//
// Le terrain en 5 couloirs x 3 tiers, colore selon le nombre de tirs de chaque zone (l'attaque en haut). Sert au resume d'un match,
// au rapport d'equipe et a l'analyse d'un adversaire.

import { intensite } from "../lib/affichage-jeu";
import type { CarteZones as Carte } from "../lib/jeu-types";

export function CarteZones({ carte, nom, hauteur = 176 }: { carte: Carte; nom: string; hauteur?: number }) {
  const total = carte.tirs.reduce((s, x) => s + x, 0), buts = carte.buts.reduce((s, x) => s + x, 0);
  return (
    <div className="relative overflow-hidden rounded-xl border-2" style={{ height: hauteur, borderColor: "rgb(var(--terrain-ligne))", backgroundColor: "rgb(var(--terrain))" }}
      role="img" aria-label={`${nom} : ${total} tir${total > 1 ? "s" : ""} placé${total > 1 ? "s" : ""}, dont ${buts} but${buts > 1 ? "s" : ""}.`}>
      <div className="absolute inset-0 grid grid-cols-5 grid-rows-3" aria-hidden>
        {carte.tirs.map((n, i) => {
          const force = intensite(n, carte.tirs);
          return (
            <div key={i} className={`flex flex-col items-center justify-center border text-xs font-bold ${force > 0.5 ? "sur-accent" : "text-ink"}`}
              style={{ borderColor: "rgb(var(--terrain-ligne))", backgroundColor: n ? `rgb(var(--accent-strong) / ${0.15 + 0.75 * force})` : "transparent" }}>
              {n > 0 && <span>{n}</span>}
              {carte.buts[i] > 0 && <span className="text-[10px] font-semibold">⚽ {carte.buts[i]}</span>}
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-[20%] top-0 h-[34%] border-[3px] border-t-0" style={{ borderColor: "rgb(var(--terrain-trace) / 0.85)" }} />
    </div>
  );
}
