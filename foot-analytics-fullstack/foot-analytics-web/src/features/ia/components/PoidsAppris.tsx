"use client";
// src/features/ia/components/PoidsAppris.tsx
//
// Ce que l'IA a appris : un poids par indice (plus il est haut, plus l'indice pese en faveur de la titularisation, du numero
// ou du dispositif). Chaque ligne montre la valeur apprise (barre pleine, a droite de zero si l'indice favorise, a gauche
// sinon) et le point de depart (repere), pour voir ce que l'entrainement a change.

import { echelleDePoids, nombre, type LignePoids } from "@/features/ia/lib/ia-format";

const MOT_SENS = { favorise: "favorise", defavorise: "defavorise", neutre: "sans effet net" } as const;

export function PoidsAppris({ titre, lignes }: { titre: string; lignes: LignePoids[] }) {
  if (lignes.length === 0) return null;
  const echelle = echelleDePoids(lignes);
  // La position (en %) d'une valeur sur l'axe : zero au centre.
  const pos = (v: number) => 50 + (v / echelle) * 50;

  return (
    <section aria-label={titre}>
      <h3 className="h-section mb-2">{titre}</h3>
      <ul className="space-y-2.5">
        {lignes.map((l) => {
          const gauche = Math.min(pos(l.appris), 50);
          const largeur = Math.abs(pos(l.appris) - 50);
          return (
            <li key={l.id} data-testid={`poids-${l.id}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 text-ink" title={l.aide}>{l.libelle}</span>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {nombre(l.depart, 1)} <span aria-hidden>→</span><span className="sr-only"> devenu </span> <span className="font-semibold text-ink">{nombre(l.appris, 1)}</span>
                </span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-panel3/70" role="img"
                aria-label={`${l.libelle} : poids ${nombre(l.appris, 1)} (depart ${nombre(l.depart, 1)}), ${MOT_SENS[l.sens]}`}>
                <span aria-hidden className="absolute inset-y-[-2px] left-1/2 w-px bg-line2" />
                <span aria-hidden className={`absolute inset-y-0 rounded-full ${l.sens === "defavorise" ? "bg-danger" : l.sens === "favorise" ? "bg-accent" : "bg-faint"}`}
                  style={{ left: `${gauche}%`, width: `${Math.max(largeur, 0.8)}%` }} />
                <span aria-hidden className="absolute top-[-3px] h-[14px] w-[2px] rounded bg-ink/70" style={{ left: `${pos(l.depart)}%` }} title="Poids de depart" />
              </div>
              <p className="mt-0.5 text-[11px] text-faint">{l.aide}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-faint">Barre pleine : poids appris. Trait fin : poids de depart (le moteur a regles).</p>
    </section>
  );
}
