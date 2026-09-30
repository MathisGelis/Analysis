// src/components/FatigueBar.tsx
//
// Jauge de fatigue d'un joueur : barre + nombre, colores selon le niveau (frais / normal / charge /
// surcharge). Sans score, un tiret : jamais une barre vide qui ressemble a un joueur frais. Une
// estimation (matchs seuls, historique court) est marquee d'un asterisque et adoucie.

import {
  estEstimation, FOND_NIVEAU, LIBELLE_NIVEAU, lireDetailFatigue, niveauFatigue, TEXTE_NIVEAU,
} from "@/lib/fatigue";

export function FatigueBar({
  score, detail, largeur = "w-14",
}: {
  score: number | null | undefined;
  /** JSON `fatigueDetail` du joueur : sert a signaler une estimation. */
  detail?: string | null;
  largeur?: string;
}) {
  const niveau = niveauFatigue(score);
  if (score == null || !niveau) return <span className="text-xs text-faint" title="Pas de charge recente connue">—</span>;
  const estimation = estEstimation(lireDetailFatigue(detail));
  return (
    <div className="flex items-center gap-2" title={`Fatigue ${LIBELLE_NIVEAU[niveau].toLowerCase()}${estimation ? " (estimation)" : ""}`}>
      <div className={`h-1.5 overflow-hidden rounded-full bg-line ${largeur}`} role="img"
        aria-label={`Fatigue ${score} sur 100, ${LIBELLE_NIVEAU[niveau].toLowerCase()}${estimation ? ", estimation" : ""}`}>
        <div className={`h-full rounded-full ${FOND_NIVEAU[niveau]} ${estimation ? "opacity-60" : ""}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`w-6 text-xs font-semibold tabular-nums ${TEXTE_NIVEAU[niveau]}`}>{score}{estimation ? "*" : ""}</span>
    </div>
  );
}
