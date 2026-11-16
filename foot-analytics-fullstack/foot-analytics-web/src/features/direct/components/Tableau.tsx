"use client";

// src/features/direct/components/Tableau.tsx
//
// Le tableau de marque : le score, le chrono (qu'on touche pour le recaler), et les boutons qui pilotent la rencontre.

import { useState } from "react";
import { Minus, Pause, Play, Plus } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";

import { libellePeriode } from "../lib/chrono";
import type { ActionChrono, ChronoDirect } from "../lib/direct-types";

export function Tableau({
  nomNous, nomEux, scoreNous, scoreEux, chrono, affichage, minute, occupe, cloture, onAction,
}: {
  nomNous: string; nomEux: string; scoreNous: number; scoreEux: number; chrono: ChronoDirect; affichage: string; minute: number;
  occupe: boolean; cloture: boolean; onAction: (a: ActionChrono, minute?: number) => void;
}) {
  const [recalage, setRecalage] = useState<number | null>(null);
  const { statut, periode } = chrono;
  const enJeu = statut === "en_cours" || statut === "pause";
  const bouton = (a: ActionChrono, libelle: string, primaire = false) => (
    <button type="button" disabled={occupe || cloture} onClick={() => onAction(a)} className={`btn !h-11 ${primaire ? "btn-primary" : ""}`}>{libelle}</button>
  );

  return (
    <section className="panel p-4" aria-label="Tableau de marque">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="h-section">Nous</div>
          <div className="truncate font-display text-[15px] font-bold text-ink">{nomNous}</div>
        </div>
        <div className="flex items-baseline gap-2.5 font-display font-black tabular-nums" aria-label={`Score : ${scoreNous} à ${scoreEux}`}>
          <span className="text-5xl leading-none text-accent">{scoreNous}</span>
          <span className="text-2xl text-muted">-</span>
          <span className="text-5xl leading-none text-sky">{scoreEux}</span>
        </div>
        <div className="min-w-0 flex-1 text-right">
          <div className="h-section">Adversaire</div>
          <div className="truncate font-display text-[15px] font-bold text-ink">{nomEux}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <button type="button" disabled={statut === "avant" || cloture} onClick={() => setRecalage(minute)}
          className="rounded-lg text-left disabled:cursor-default" aria-label={`Chrono ${affichage}. Recaler la minute`}>
          <span className="block font-display text-3xl font-bold leading-none tabular-nums text-ink">{affichage}</span>
          <span className="mt-1 block text-xs text-muted">{libellePeriode(chrono)}</span>
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          {statut === "avant" && bouton("demarrer", "Coup d'envoi", true)}
          {statut === "en_cours" && (
            <button type="button" disabled={occupe || cloture} onClick={() => onAction("pause")} className="btn !h-11"><Pause size={15} aria-hidden /> Pause</button>
          )}
          {statut === "pause" && (
            <button type="button" disabled={occupe || cloture} onClick={() => onAction("reprendre")} className="btn btn-primary !h-11"><Play size={15} aria-hidden /> Reprendre</button>
          )}
          {enJeu && periode === 1 && bouton("mi_temps", "Mi-temps")}
          {statut === "mi_temps" && bouton("deuxieme_periode", "2e période", true)}
          {enJeu && periode === 2 && bouton("fin", "Fin du match")}
        </div>
      </div>

      {recalage !== null && (
        <Modal open onClose={() => setRecalage(null)} maxWidth="max-w-xs" titre="Recaler le chrono">
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold text-ink">Recaler le chrono</h2>
            <p className="text-sm text-muted">Le chrono repart de cette minute de match, sans rien changer aux événements déjà saisis.</p>
            <div className="flex items-center justify-center gap-3">
              <button type="button" aria-label="Une minute de moins" className="btn !h-12 !w-12 !p-0" onClick={() => setRecalage(Math.max(0, recalage - 1))}><Minus size={18} aria-hidden /></button>
              <span className="grid h-12 min-w-[5rem] place-items-center rounded-xl border border-line bg-bg font-display text-2xl font-bold tabular-nums">{recalage}&apos;</span>
              <button type="button" aria-label="Une minute de plus" className="btn !h-12 !w-12 !p-0" onClick={() => setRecalage(Math.min(200, recalage + 1))}><Plus size={18} aria-hidden /></button>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setRecalage(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" onClick={() => { onAction("corriger", recalage); setRecalage(null); }}>Recaler</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
