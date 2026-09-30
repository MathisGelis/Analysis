// src/components/prematch/SystemeProbable.tsx
//
// Systeme de jeu probable de l'adversaire. La feuille de match FMI ne contient aucun dispositif : la prediction ne
// repose que sur ceux que le staff a renseignes sur les matchs de l'adversaire (les plus recents pesant plus), et
// dit combien. Sans aucun, elle le dit et renvoie vers la saisie au lieu de supposer un 4-4-2.

import Link from "next/link";
import { Info } from "lucide-react";
import type { RapportPrematch } from "@/lib/prematch-types";

const FIABILITE = {
  faible: { libelle: "Echantillon mince", classe: "badge-amber" },
  moyenne: { libelle: "Fiabilite moyenne", classe: "" },
  bonne: { libelle: "Bonne fiabilite", classe: "badge-accent" },
} as const;

export function SystemeProbable({ donnees, adversaire }: { donnees: RapportPrematch["systemeAdverse"]; adversaire: string }) {
  const { prediction: p, observes, matchs, dernierMatchId } = donnees;
  if (!p) {
    return (
      <div className="flex items-start gap-3 text-sm text-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <p>
          Aucun systeme de jeu renseigne pour {adversaire} ({matchs} match{matchs > 1 ? "s" : ""} joue{matchs > 1 ? "s" : ""}). La feuille de match n'en
          contient pas : il se saisit sur la fiche d'un match, par exemple apres l'avoir affronte.
          {dernierMatchId && <> <Link href={`/matchs/${dernierMatchId}`} className="text-accent underline underline-offset-2">Renseigner sur son dernier match</Link>.</>}
        </p>
      </div>
    );
  }
  const f = FIABILITE[p.fiabilite];
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <div>
        <div className="stat-label">Systeme probable</div>
        <div className="mt-1 font-display text-4xl font-bold tabular-nums text-ink">{p.systeme}</div>
      </div>
      <div className="min-w-0 space-y-1.5 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${f.classe}`}>{f.libelle}</span>
          <span>{p.confiance} % du poids sur {p.observations} match{p.observations > 1 ? "s" : ""} renseigne{p.observations > 1 ? "s" : ""} (sur {matchs} joue{matchs > 1 ? "s" : ""})</span>
        </div>
        {p.alternatives.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-faint">Sinon :</span>
            {p.alternatives.map((a) => <span key={a.systeme} className="badge">{a.systeme} · {a.poids} %</span>)}
          </div>
        )}
        {observes < matchs && dernierMatchId && (
          <div><Link href={`/matchs/${dernierMatchId}`} className="text-accent underline underline-offset-2">Renseigner d'autres matchs</Link> pour affiner.</div>
        )}
      </div>
    </div>
  );
}
