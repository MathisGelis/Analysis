"use client";
// src/features/ia/components/ErreursIa.tsx
//
// Les erreurs notees pendant l'entrainement : les compositions les plus ratees (qui n'etait pas prevu, qui l'etait a tort)
// et les joueurs que l'IA n'arrive pas a lire (titulaires surprises, titulaires annonces qui ne jouent pas).

import { pct, texteFauxPositifs, texteManques } from "@/features/ia/lib/ia-format";
import type { ErreurFeuille, JoueurDifficile } from "@/features/ia/lib/ia-types";

export function ErreursIa({ pires, difficiles }: { pires: ErreurFeuille[]; difficiles: JoueurDifficile[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section aria-label="Compositions les plus ratees">
        <h3 className="h-section mb-2">Compositions les plus ratees</h3>
        {pires.length === 0 ? <p className="text-sm text-muted">Aucune erreur a signaler.</p> : (
          <ol className="space-y-2">
            {pires.slice(0, 8).map((e) => (
              <li key={`${e.matchId}-${e.equipe}`} className="panel-inset p-3 text-sm" data-testid="pire-composition">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-ink">{e.equipe} <span className="font-normal text-muted">{e.domicile ? "recoit" : "se deplace chez"} {e.adversaire}</span></span>
                  <span className="font-mono text-xs text-faint">{e.date}{e.journee ? ` · J${e.journee}` : ""}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  <span className="font-semibold text-ink">{Math.round(e.onze * 11)} titulaires sur 11</span> bien predits ({pct(e.onze, 0)}).
                </p>
                <p className="mt-1 text-xs text-muted"><span className="font-semibold text-danger">Pas vus venir :</span> {texteManques(e)}</p>
                {e.fauxPositifs.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted"><span className="font-semibold text-amber">Annonces a tort :</span> {texteFauxPositifs(e)}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Joueurs difficiles a lire">
        <h3 className="h-section mb-2">Joueurs difficiles a lire</h3>
        {difficiles.length === 0 ? <p className="text-sm text-muted">Pas assez de matchs pour isoler des joueurs difficiles a lire.</p> : (
          <>
            <ul className="space-y-2">
              {difficiles.map((j) => (
                <li key={`${j.equipe}-${j.nom}`} className="panel-inset flex items-baseline justify-between gap-3 p-3 text-sm" data-testid="joueur-difficile">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{j.nom}</span>
                    <span className="block truncate text-xs text-faint">{j.equipe}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted">
                    <span className="block">annonce a {pct(j.probaMoyenne, 0)} en moyenne</span>
                    <span className="block">titulaire {j.titularisations} fois sur {j.matchs}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">Des joueurs en rotation : ni titulaires surs, ni remplacants surs. Aucun indice de l'historique ne permet de deviner leur place.</p>
          </>
        )}
      </section>
    </div>
  );
}
