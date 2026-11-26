"use client";
// src/features/analyse-jeu/components/CarteTirs.tsx
//
// La carte des tirs d'un match ou d'une saison : le terrain (15 zones) et la cage (6 zones), filtrables (tous, cadres, non cadres, buts)
// et par equipe (la nôtre, l'adversaire). Les filtres jouent sur la meme liste de tirs : terrain et cage restent toujours d'accord.

import { useState } from "react";

import type { TirCarte } from "../lib/jeu-types";
import { cageDesTirs, carteDesTirs, filtrerTirs, FILTRES_TIRS, xgDesTirs, type FiltreTirs } from "../lib/tirs-carte";
import { CageTirs } from "./CageTirs";
import { CarteZones } from "./CarteZones";

export function CarteTirs({ nous, eux, equipeNous = "Notre équipe" }: { nous: TirCarte[]; eux?: TirCarte[]; equipeNous?: string }) {
  const [filtre, setFiltre] = useState<FiltreTirs>("tous");
  const [equipe, setEquipe] = useState<"nous" | "eux">("nous");
  const tirs = equipe === "nous" ? nous : eux ?? [];
  const retenus = filtrerTirs(tirs, filtre);
  const carte = carteDesTirs(retenus);
  const cage = cageDesTirs(retenus);
  const nom = equipe === "nous" ? equipeNous : "L'adversaire";
  const chip = (actif: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${actif ? "border-accent bg-accent/15 text-ink" : "border-line bg-surface text-muted hover:text-ink"}`;

  return (
    <div className="space-y-3" data-testid="carte-tirs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Filtrer les tirs" className="flex flex-wrap gap-1.5">
          {FILTRES_TIRS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={filtre === f.id} className={chip(filtre === f.id)} onClick={() => setFiltre(f.id)}>{f.libelle}</button>
          ))}
        </div>
        {eux && (
          <div role="radiogroup" aria-label="Équipe" className="flex gap-1.5">
            {([["nous", "Nous"], ["eux", "Adversaire"]] as const).map(([id, libelle]) => (
              <button key={id} type="button" role="radio" aria-checked={equipe === id} className={chip(equipe === id)} onClick={() => setEquipe(id)}>{libelle}</button>
            ))}
          </div>
        )}
      </div>

      {retenus.length === 0 ? (
        <p className="panel-inset p-3 text-sm text-muted" data-testid="carte-tirs-vide">Aucun tir ne correspond à ce filtre.</p>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
          <div>
            <CarteZones carte={carte} nom={`${nom} : carte des tirs (${FILTRES_TIRS.find((f) => f.id === filtre)!.libelle.toLowerCase()})`} />
            {carte.sansZone > 0 && <p className="mt-1 text-[11px] text-faint">{carte.sansZone} tir{carte.sansZone > 1 ? "s" : ""} sans zone du terrain saisie.</p>}
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Dans la cage</div>
            <CageTirs cage={cage} nom={`${nom} : zones dans la cage`} />
          </div>
        </div>
      )}
      <p className="text-xs text-muted" data-testid="carte-tirs-resume">
        {retenus.length} tir{retenus.length > 1 ? "s" : ""} · xG estimé {xgDesTirs(retenus).toFixed(2)} · l&apos;attaque est en haut, ⚽ = buts. Plus la case est foncée, plus il y a de tirs.
      </p>
    </div>
  );
}
