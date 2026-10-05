"use client";
// src/features/ia/components/LancerEntrainementModale.tsx
//
// Lancer un entrainement : sur toutes les saisons (defaut) ou sur celles que l'on coche, avec ou sans l'essai de
// plusieurs jeux d'hyperparametres (plus long, un peu meilleur).

import { useState } from "react";
import { Play } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import type { EtatIa } from "@/features/ia/lib/ia-types";

export function LancerEntrainementModale({
  ouvert, onClose, donnees, occupe, onLancer,
}: {
  ouvert: boolean;
  onClose: () => void;
  donnees: EtatIa["donnees"];
  occupe: boolean;
  onLancer: (options: { optimiser: boolean; saisonIds: string[] }) => void;
}) {
  const [optimiser, setOptimiser] = useState(true);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const avecMatchs = donnees.saisons.filter((s) => s.matchs > 0);
  const bascule = (id: string) => setChoisies((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nbMatchs = choisies.size === 0 ? donnees.matchsJoues : donnees.saisons.filter((s) => choisies.has(s.id)).reduce((t, s) => t + s.matchs, 0);

  return (
    <Modal open={ouvert} onClose={() => !occupe && onClose()} maxWidth="max-w-lg">
      <h2 className="font-display text-lg font-bold text-ink">Lancer un entrainement</h2>
      <p className="mt-1 text-sm text-muted">
        L'IA rejoue toutes les feuilles de match dans l'ordre des dates : elle predit les compos d'une semaine, decouvre ce qui
        s'est vraiment passe, corrige ses erreurs, puis passe a la semaine suivante.
      </p>

      <fieldset className="mt-4">
        <legend className="h-section mb-2">Saisons</legend>
        {avecMatchs.length === 0 ? <p className="text-sm text-muted">Aucun match joue en base.</p> : (
          <ul className="space-y-1.5">
            {avecMatchs.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:bg-line/40">
                  <input type="checkbox" checked={choisies.has(s.id)} onChange={() => bascule(s.id)} />
                  <span className="flex-1 font-semibold text-ink">{s.nom}</span>
                  <span className="text-xs text-muted">{s.matchs} match{s.matchs > 1 ? "s" : ""}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-faint">
          {choisies.size === 0 ? "Aucune case cochee : toutes les saisons." : `${choisies.size} saison${choisies.size > 1 ? "s" : ""} cochee${choisies.size > 1 ? "s" : ""}.`}
          {" "}{nbMatchs} match{nbMatchs > 1 ? "s" : ""} joue{nbMatchs > 1 ? "s" : ""}.
        </p>
      </fieldset>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-line/40">
        <input type="checkbox" className="mt-1" checked={optimiser} onChange={(e) => setOptimiser(e.target.checked)} />
        <span>
          <span className="block font-semibold text-ink">Chercher les meilleurs reglages</span>
          <span className="block text-xs text-muted">
            Essaie 8 combinaisons (longueur de l'historique relu, prudence du modele, oubli des vieux matchs) et garde la meilleure.
            Plus long, surtout sur beaucoup de matchs.
          </span>
        </span>
      </label>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" className="btn text-sm" onClick={onClose} disabled={occupe}>Annuler</button>
        <button type="button" className="btn btn-primary text-sm" disabled={occupe || avecMatchs.length === 0}
          onClick={() => onLancer({ optimiser, saisonIds: [...choisies] })}>
          <Play size={14} aria-hidden /> {occupe ? "Lancement..." : "Lancer l'entrainement"}
        </button>
      </div>
    </Modal>
  );
}
