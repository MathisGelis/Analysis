"use client";

// src/features/direct/components/GrilleActions.tsx
//
// Les gros boutons du direct : un appui choisit l'action, la feuille de saisie fait le reste.

import { ACTIONS } from "../lib/actions";

const PRINCIPALES = ["but", "tir", "arret", "corner", "coup_franc", "penalty", "faute", "hors_jeu"];

export function GrilleActions({ onChoisir, desactive }: { onChoisir: (actionId: string) => void; desactive: boolean }) {
  const classe = "btn !h-16 flex-col !gap-0.5 text-base font-bold disabled:opacity-50";
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Actions du match">
      {PRINCIPALES.map((id) => {
        const a = ACTIONS.find((x) => x.id === id)!;
        return (
          <button key={id} type="button" disabled={desactive} onClick={() => onChoisir(id)}
            className={`${classe} ${id === "but" ? "!border-accent bg-accent/10 text-accent" : ""}`}>{a.libelle}</button>
        );
      })}
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" disabled={desactive} onClick={() => onChoisir("carton_jaune")} aria-label="Carton jaune"
          className="btn !h-16 !p-0 disabled:opacity-50"><span className="h-6 w-4 rounded-sm bg-amber" aria-hidden /></button>
        <button type="button" disabled={desactive} onClick={() => onChoisir("carton_rouge")} aria-label="Carton rouge"
          className="btn !h-16 !p-0 disabled:opacity-50"><span className="h-6 w-4 rounded-sm bg-danger" aria-hidden /></button>
      </div>
      <button type="button" disabled={desactive} onClick={() => onChoisir("remplacement")} className={`${classe} col-span-2`}>Remplacement</button>
      <button type="button" disabled={desactive} onClick={() => onChoisir("blessure")} className={classe}>Blessure</button>
    </div>
  );
}
