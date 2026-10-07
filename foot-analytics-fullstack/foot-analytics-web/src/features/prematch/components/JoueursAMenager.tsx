// src/features/prematch/components/JoueursAMenager.tsx
//
// Les joueurs de NOTRE effectif les plus fatigues avant le match (a menager ou a surveiller). La fatigue est une mesure du
// moment, calculee sur les 28 derniers jours : elle n'existe que sur la saison en cours.

import Link from "next/link";

import { FatigueBar } from "@/features/joueurs/components/FatigueBar";
import { COULEUR_NIVEAU, LIBELLE_NIVEAU, niveauFatigue } from "@/features/joueurs/lib/fatigue";

export interface JoueurFatigue { id: string; prenom?: string | null; nom: string; scoreFatigue: number | null; fatigueDetail?: unknown }

export function JoueursAMenager({ joueurs, saisonActive }: { joueurs: JoueurFatigue[]; saisonActive: boolean }) {
  if (joueurs.length === 0) {
    return (
      <p className="text-sm text-muted">
        {saisonActive
          ? "Aucune charge recente connue : la fatigue se calcule sur les seances et les matchs des 28 derniers jours."
          : "La fatigue est une mesure du moment : elle n'est disponible que sur la saison en cours."}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {joueurs.map((j) => {
        const niveau = niveauFatigue(j.scoreFatigue);
        return (
          <li key={j.id} className="no-coupure flex items-center gap-3 py-2 text-sm">
            <Link href={`/joueur/${j.id}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-accent">{j.prenom} {j.nom}</Link>
            {niveau && <span className="text-[11px]" style={{ color: COULEUR_NIVEAU[niveau] }}>{LIBELLE_NIVEAU[niveau]}</span>}
            <FatigueBar score={j.scoreFatigue} detail={j.fatigueDetail as never} largeur="w-16" />
          </li>
        );
      })}
    </ul>
  );
}
