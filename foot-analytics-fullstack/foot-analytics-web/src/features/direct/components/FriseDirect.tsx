"use client";

// src/features/direct/components/FriseDirect.tsx
//
// La frise du match : tous les evenements, du plus recent au plus ancien, filtrables ; un touche ouvre la correction.

import { useMemo, useState } from "react";

import { joueurLibelle, libelleEvenement, zoneCourte } from "../lib/actions";
import { libelleMinute } from "../lib/chrono";
import type { Cote, EvenementDirect } from "../lib/direct-types";

type Filtre = "tout" | "nous" | "adv" | "buts" | "tirs";

const FILTRES: [Filtre, string][] = [["tout", "Tout"], ["nous", "Nous"], ["adv", "Adversaire"], ["buts", "Buts"], ["tirs", "Tirs"]];

export function FriseDirect({
  evenements, nousCote, dureePeriodeMin, onChoisir, limite, desactive,
}: { evenements: EvenementDirect[]; nousCote: Cote; dureePeriodeMin: number; onChoisir: (e: EvenementDirect) => void; limite?: number; desactive?: boolean }) {
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const liste = useMemo(() => {
    const f = evenements.filter((e) =>
      filtre === "tout" ? true : filtre === "nous" ? e.cote === nousCote : filtre === "adv" ? e.cote !== nousCote
        : filtre === "buts" ? e.resultat === "but" && ["tir", "coup_franc", "penalty"].includes(e.type)
          : ["tir", "coup_franc", "penalty"].includes(e.type));
    const recents = [...f].reverse();
    return limite ? recents.slice(0, limite) : recents;
  }, [evenements, filtre, nousCote, limite]);

  return (
    <div className="space-y-2">
      {!limite && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer la frise">
          {FILTRES.map(([id, libelle]) => (
            <button key={id} type="button" aria-pressed={filtre === id} onClick={() => setFiltre(id)}
              className={`btn !h-9 !rounded-full !px-3.5 text-[13px] ${filtre === id ? "btn-primary" : ""}`}>{libelle}</button>
          ))}
        </div>
      )}
      {liste.length === 0 && <p className="panel-inset p-3 text-sm text-muted">Aucun événement pour l&apos;instant.</p>}
      <ul className="space-y-1.5">
        {liste.map((e) => {
          const nous = e.cote === nousCote;
          const joueur = joueurLibelle(e.joueurNumero, e.joueurNom);
          const detail = [libelleEvenement(e), joueur, e.joueur2Numero !== null && e.type === "remplacement" ? `→ ${joueurLibelle(e.joueur2Numero, e.joueur2Nom)}` : null].filter(Boolean).join(" · ");
          return (
            <li key={e.id}>
              <button type="button" disabled={desactive} onClick={() => onChoisir(e)} aria-label={`${libelleMinute(e.minute, e.periode, dureePeriodeMin)}e minute : ${detail}. Modifier`}
                className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-70">
                <span className="w-10 shrink-0 font-display text-sm font-bold tabular-nums text-muted">{libelleMinute(e.minute, e.periode, dureePeriodeMin)}&apos;</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${nous ? "bg-accent" : "bg-sky"}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{detail}{!nous && " (adversaire)"}</span>
                <span className="shrink-0 text-xs text-muted">{zoneCourte(e.zoneTier, e.zoneCouloir)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
