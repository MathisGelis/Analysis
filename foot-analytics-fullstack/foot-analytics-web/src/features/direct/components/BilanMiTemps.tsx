"use client";

// src/features/direct/components/BilanMiTemps.tsx
//
// Le bilan de la premiere periode, affiche a la mi-temps : les chiffres a comparer, les joueurs a suivre, et des pistes pour la seconde
// periode (chacune appuyee sur un chiffre). Reserve au staff : un saisisseur invite ne le voit pas.

import { useEffect, useState } from "react";

import { api, messageApi } from "@/shared/lib/api";
import { Spinner } from "@/shared/ui/Spinner";

import type { BilanMiTemps as Bilan, PisteMiTemps } from "../lib/bilan-types";
import { joueurLibelle } from "../lib/actions";

const nb = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
const TON: Record<PisteMiTemps["ton"], string> = { bon: "border-win", alerte: "border-danger", neutre: "border-sky" };

export function BilanMiTemps({ matchId, nomNous, nomEux }: { matchId: string; nomNous: string; nomEux: string }) {
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    api.bilanMiTemps(matchId).then((b) => { if (vivant) setBilan(b); }).catch((e) => { if (vivant) setErreur(messageApi(e, "Bilan indisponible.")); });
    return () => { vivant = false; };
  }, [matchId]);

  if (erreur) return <p role="alert" className="panel-inset border-l-2 border-danger p-3 text-sm text-ink">{erreur}</p>;
  if (!bilan) return <div className="flex justify-center p-4" role="status" aria-label="Calcul du bilan de mi-temps"><Spinner taille={18} /></div>;
  if (!bilan.disponible) return <p className="panel-inset p-3 text-sm text-muted" data-testid="bilan-mi-temps">Rien n&apos;a été saisi en première période : pas de bilan à faire.</p>;

  return (
    <section aria-label="Bilan de la première période" className="panel space-y-3 p-4" data-testid="bilan-mi-temps">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold text-ink">Bilan de la 1re période</h2>
        <span className="font-display text-lg font-bold tabular-nums text-ink">{bilan.score.nous} – {bilan.score.eux}</span>
      </div>
      <table className="table-fm">
        <thead><tr><th><span className="sr-only">Indicateur</span></th><th className="text-right">{nomNous}</th><th className="text-right">{nomEux}</th></tr></thead>
        <tbody>
          {bilan.lignes.map((l) => (
            <tr key={l.cle}><td className="text-muted">{l.libelle}</td><td className="text-right font-semibold tabular-nums text-accent">{nb(l.nous)}</td><td className="text-right font-semibold tabular-nums text-sky">{nb(l.eux)}</td></tr>
          ))}
        </tbody>
      </table>
      {bilan.joueurs.length > 0 && (
        <div>
          <h3 className="h-section mb-1.5">À suivre</h3>
          <ul className="space-y-1 text-sm">
            {bilan.joueurs.map((j) => (
              <li key={`${j.numero}-${j.nom}`} className="flex flex-wrap items-baseline gap-x-2">
                <strong className="text-ink">{joueurLibelle(j.numero, j.nom)}</strong>
                <span className="text-muted">
                  {[j.buts ? `${j.buts} but${j.buts > 1 ? "s" : ""}` : "", j.fautes ? `${j.fautes} faute${j.fautes > 1 ? "s" : ""}` : "", j.jaunes ? "averti" : "", j.rouges ? "expulsé" : ""].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="h-section">Pour la seconde période</h3>
        {bilan.pistes.length === 0 && <p className="text-sm text-muted">Rien de marquant ne ressort de la première période.</p>}
        {bilan.pistes.map((p) => (
          <div key={p.titre} className={`panel-inset border-l-2 p-3 ${TON[p.ton]}`}>
            <div className="text-sm font-semibold text-ink">{p.titre}</div>
            <div className="text-[13px] text-muted">{p.detail}</div>
            {p.piste && <div className="mt-1 text-[13px] text-ink">→ {p.piste}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
