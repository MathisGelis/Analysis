// src/features/joueurs/components/FatiguePanel.tsx
//
// Fatigue d'un joueur, expliquee : le score, son niveau et les quatre facteurs qui le composent
// (charge de la semaine, efforts des derniers jours, matchs recents, vulnerabilite), avec la
// part de chacun. On montre POURQUOI un joueur est fatigue, pas seulement un nombre.

import { AlertTriangle, Info } from "lucide-react";

import {
  estEstimation, FOND_NIVEAU, LIBELLE_NIVEAU, niveauFatigue, PASTILLE_NIVEAU, TEXTE_NIVEAU,
  type FatigueDetail,
} from "@/features/joueurs/lib/fatigue";

const RAISON: Record<string, string> = {
  indisponible: "Joueur indisponible : pas de score de fatigue tant qu'il est blessé.",
  aucune_donnee: "Aucune séance ni aucun match sur les 4 dernières semaines : rien à mesurer.",
};

export function FatiguePanel({
  score, detail, acwr, chargeAigue,
}: { score: number | null | undefined; detail: FatigueDetail | null; acwr?: number | null; chargeAigue?: number | null }) {
  const niveau = niveauFatigue(score);
  const date = detail?.calculeLe ? new Date(detail.calculeLe).toLocaleDateString("fr-FR") : null;

  if (score == null || !niveau) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted">
        <Info size={15} className="mt-0.5 shrink-0 text-faint" aria-hidden />
        {(detail?.raison && RAISON[detail.raison]) || "Pas de donnée de charge récente (séances, matchs) pour ce joueur."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`font-display text-4xl font-black tabular-nums ${TEXTE_NIVEAU[niveau]}`}>{score}</span>
        <span className="text-xs text-faint">/ 100</span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PASTILLE_NIVEAU[niveau]}`}>
          {LIBELLE_NIVEAU[niveau]}
        </span>
        {estEstimation(detail) && (
          <span className="badge" title="Calculé sur les matchs seuls, ou avec moins de 2 semaines d'historique">Estimation</span>
        )}
        {acwr != null && (
          <span className="text-[11px] text-muted">ACWR <b className="text-ink tabular-nums">{acwr.toFixed(2)}</b>{chargeAigue != null ? ` · ${Math.round(chargeAigue)} UA / 7 j` : ""}</span>
        )}
      </div>

      {detail && (
        <ul className="space-y-3">
          {detail.facteurs.map((f) => {
            const n = niveauFatigue(f.pression) ?? "normal";
            return (
              <li key={f.cle}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{f.libelle}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {Math.round(f.poids * 100)} % du score · <b className={TEXTE_NIVEAU[n]}>+{Math.round(f.points)}</b> pts
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${f.libelle} : pression ${f.pression} sur 100`}>
                  <div className={`h-full rounded-full ${FOND_NIVEAU[n]}`} style={{ width: `${f.pression}%` }} />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-faint">{f.detail}</p>
              </li>
            );
          })}
        </ul>
      )}

      {(niveau === "surcharge" || niveau === "charge") && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${niveau === "surcharge" ? "bg-danger/10 text-danger" : "bg-amber/10 text-amber"}`}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          {niveau === "surcharge"
            ? "Fatigue élevée : préférer un allégement ou un temps de jeu réduit avant le prochain match."
            : "Charge soutenue : à surveiller, surtout si un match approche."}
        </p>
      )}
      {date && <p className="text-[10px] text-faint">Calculée au {date}, à partir des séances et des minutes de match des 28 derniers jours.</p>}
    </div>
  );
}

/** Rappel du modele, replie par defaut. */
export function FatigueLegende() {
  return (
    <details className="group text-[11px] text-muted">
      <summary className="cursor-pointer list-none text-faint hover:text-ink">
        <span className="underline decoration-dotted underline-offset-2">Comment la fatigue est-elle calculée ?</span>
      </summary>
      <div className="mt-2 space-y-1.5 leading-relaxed">
        <p>Un seul score de 0 (frais) a 100 (surcharge), à partir de la charge d'entraînement ET de la charge en match des 28 derniers jours.</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li><b className="text-ink">Charge de la semaine (40 %)</b> : charge des 7 derniers jours comparée à la moyenne hebdomadaire (ACWR). Zone saine : 0,8 a 1,3.</li>
          <li><b className="text-ink">Efforts des derniers jours (30 %)</b> : ce qui reste dans les jambes des séances et matchs des 3 a 5 derniers jours.</li>
          <li><b className="text-ink">Matchs récents (20 %)</b> : minutes jouées sur 7 et 14 jours. Deux matchs pleins en une semaine = maximum.</li>
          <li><b className="text-ink">Vulnérabilité (10 %)</b> : blessures antérieures, retour de blessure récent, âge.</li>
        </ul>
        <p>Charge d'une séance : durée x effort perçu (RPE), ajustée au type de séance. Charge d'un match : minutes jouées x 7,5. Chez un adversaire, seuls les matchs sont connus : le score est une estimation (*).</p>
      </div>
    </details>
  );
}
