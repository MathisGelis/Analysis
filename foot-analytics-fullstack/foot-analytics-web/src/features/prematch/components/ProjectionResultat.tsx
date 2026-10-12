// src/features/prematch/components/ProjectionResultat.tsx
//
// Projection du resultat d'un match (modele de Poisson sur les moyennes de buts) : probabilites de victoire, nul et defaite,
// score le plus probable. Se tait (et dit pourquoi) quand l'echantillon est trop petit. Fonction du rapport pre-match.

import { Sparkles } from "lucide-react";

import { decimal } from "@/features/analyse/lib/tendances-format";

import type { RapportPrematch } from "../lib/prematch-types";

export function ProjectionResultat({ r }: { r: RapportPrematch }) {
  const p = r.projection;
  if (!p) {
    return (
      <p className="text-sm text-muted">
        Pas assez de matchs joues pour projeter un resultat : il en faut au moins 5 de chaque cote ({r.monEquipe.matchs} pour nous, {r.adversaire.matchs} pour {r.adversaire.clubNom}).
      </p>
    );
  }
  return (
    <>
      <div className="space-y-3">
        <Proba label="Victoire" valeur={p.pV} couleur="rgb(var(--win))" />
        <Proba label="Match nul" valeur={p.pN} couleur="rgb(var(--draw))" />
        <Proba label="Defaite" valeur={p.pD} couleur="rgb(var(--loss))" />
      </div>
      <div className="panel-inset no-coupure mt-4 border-l-2 border-accent p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent"><Sparkles size={11} aria-hidden /> Score le plus probable</div>
        <div className="mt-1 font-display text-3xl font-black tabular-nums text-ink">
          {p.scoreProbable.moi} – {p.scoreProbable.adv}
          <span className="ml-2 text-xs font-normal text-faint">{p.scoreProbable.proba} % de chances</span>
        </div>
        <p className="mt-1 text-[12px] text-muted">
          Buts attendus : {decimal(p.buts.moi)} pour nous, {decimal(p.buts.adv)} pour eux. Modele de Poisson sur les moyennes de buts
          (sur au moins {p.matchs} matchs de chaque equipe){r.match ? `, ${r.match.domicile ? "a domicile" : "a l'exterieur"} compris` : ""}.
        </p>
      </div>
    </>
  );
}

function Proba({ label, valeur, couleur }: { label: string; valeur: number; couleur: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-xs text-muted">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${label} : ${valeur} %`}>
        <div className="h-full" style={{ width: `${valeur}%`, background: couleur }} />
      </div>
      <div className="w-10 text-right font-mono font-bold tabular-nums">{valeur}%</div>
    </div>
  );
}
