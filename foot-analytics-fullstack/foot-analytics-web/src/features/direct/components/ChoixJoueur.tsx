"use client";

// src/features/direct/components/ChoixJoueur.tsx
//
// Choisir le joueur d'un evenement. Notre equipe : l'effectif en gros boutons, titulaires du plan de jeu en tete. L'adversaire : son
// numero de maillot au pave numerique (on ne connait pas ses joueurs).

import { useState } from "react";
import { Delete } from "lucide-react";

import type { JoueurDirect } from "../lib/direct-types";

export interface JoueurChoisi { numero: number | null; nom: string | null; id: string | null }

const nomComplet = (j: JoueurDirect) => [j.prenom, j.nom].filter(Boolean).join(" ");

export function ChoixJoueur({
  joueurs, adversaire, choisi, onChoisir, aucunLibelle = "Joueur inconnu",
}: {
  joueurs: JoueurDirect[]; adversaire: boolean; choisi: JoueurChoisi; onChoisir: (j: JoueurChoisi) => void; aucunLibelle?: string;
}) {
  if (adversaire) return <PaveNumero numero={choisi.numero} onChange={(n) => onChoisir({ numero: n, nom: null, id: null })} aucunLibelle={aucunLibelle} />;
  const groupes: [string, JoueurDirect[]][] = [
    ["Titulaires", joueurs.filter((j) => j.role === "titulaire")],
    ["Remplaçants", joueurs.filter((j) => j.role === "remplacant")],
    ["Autres joueurs", joueurs.filter((j) => j.role === "groupe")],
  ];
  const nonVides = groupes.filter(([, l]) => l.length > 0);
  return (
    <div className="space-y-3">
      {joueurs.length === 0 && <p className="text-sm text-muted">Aucun joueur dans l&apos;effectif de cette équipe : note le numéro de maillot, ou ajoute des joueurs à l&apos;effectif.</p>}
      {nonVides.map(([titre, liste]) => (
        <div key={titre}>
          {nonVides.length > 1 && <div className="h-section mb-1.5">{titre}</div>}
          <div className="grid grid-cols-2 gap-2">
            {liste.map((j) => {
              const actif = choisi.id === j.id;
              return (
                <button key={j.id} type="button" aria-pressed={actif}
                  onClick={() => onChoisir({ numero: j.numero, nom: nomComplet(j), id: j.id })}
                  className={`flex min-h-[3.25rem] items-center gap-2.5 rounded-xl border px-3 text-left transition-colors ${actif ? "border-accent bg-accent/15" : "border-line bg-surface hover:bg-surface-2"}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-sm font-bold ${actif ? "bg-accentstrong text-white" : "bg-surface-3 text-ink"}`}>{j.numero ?? "–"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{nomComplet(j)}</span>
                    {j.poste && <span className="block text-[11px] text-muted">{j.poste}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <JoueurInconnu actif={choisi.id === null && choisi.numero === null} onClick={() => onChoisir({ numero: null, nom: null, id: null })} libelle={aucunLibelle} />
    </div>
  );
}

function JoueurInconnu({ actif, onClick, libelle }: { actif: boolean; onClick: () => void; libelle: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
      className={`btn w-full ${actif ? "border-accent text-accent" : ""}`}>{libelle}</button>
  );
}

function PaveNumero({ numero, onChange, aucunLibelle }: { numero: number | null; onChange: (n: number | null) => void; aucunLibelle: string }) {
  const [saisie, setSaisie] = useState(numero === null ? "" : String(numero));
  const poser = (s: string) => { setSaisie(s); onChange(s === "" ? null : Number(s)); };
  return (
    <div className="space-y-3">
      <div className="panel-inset flex items-center justify-between px-4 py-3">
        <span className="text-sm text-muted">Numéro de maillot adverse</span>
        <span className="font-display text-3xl font-bold tabular-nums text-sky" aria-live="polite">{saisie === "" ? "–" : saisie}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
          <button key={n} type="button" onClick={() => poser(saisie.length >= 2 ? n : saisie + n)} className="btn !h-14 text-xl font-bold">{n}</button>
        ))}
        <button type="button" onClick={() => poser("")} className="btn !h-14 text-sm">Effacer</button>
        <button type="button" onClick={() => poser(saisie.length >= 2 ? "0" : saisie + "0")} className="btn !h-14 text-xl font-bold">0</button>
        <button type="button" aria-label="Supprimer le dernier chiffre" onClick={() => poser(saisie.slice(0, -1))} className="btn !h-14"><Delete size={20} aria-hidden /></button>
      </div>
      <button type="button" onClick={() => poser("")} className="btn w-full">{aucunLibelle}</button>
    </div>
  );
}
