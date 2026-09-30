// src/components/HistoriqueClub.tsx
//
// Parcours d'un joueur par saison, calcule depuis ses compositions
// reelles. Affiche une frise verticale "2025-2026 -> 2024-2025 -> ..."
// avec, pour chaque saison, le ou les clubs/equipes ou il a evolue.

import { ClubBadge } from "@/components/ClubBadge";
import { Calendar } from "lucide-react";

interface Ligne {
  clubId: string;
  equipeId: string | null;
  equipeNom: string | null;
  competitionLibelle: string | null;
  poule: string | null;
  matchs: number;
  titularisations: number;
  minutes: number;
}
interface Saison {
  saisonId: string | null;
  saisonNom: string;
  anneeDebut: number;
  lignes: Ligne[];
}
interface Props {
  historique: Saison[];
  clubs: { id: string; nom: string }[];
}

export function HistoriqueClub({ historique, clubs }: Props) {
  const clubNom = (id: string) =>
    clubs.find((c) => c.id === id)?.nom ?? id.slice(0, 6);

  return (
    <section className="panel p-5">
      <div className="h-section mb-3 flex items-center gap-2">
        <Calendar size={11} className="text-turf"/>
        Historique
      </div>
      {historique.length === 0 ? (
        <p className="text-xs text-faint py-4">
          Aucune participation en feuille de match pour ce joueur.
        </p>
      ) : (
        <ul className="space-y-3">
          {historique.map((s) => (
            <li key={s.saisonId ?? "_"} className="panel-inset p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-display font-bold text-ink">{s.saisonNom}</div>
                <div className="text-[10px] uppercase tracking-wider text-faint tabular-nums">
                  {s.lignes.reduce((sum, l) => sum + l.matchs, 0)} match
                  {s.lignes.reduce((sum, l) => sum + l.matchs, 0) > 1 ? "s" : ""}
                </div>
              </div>
              <ul className="space-y-1.5">
                {s.lignes.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <ClubBadge clubId={l.clubId} size={18}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink truncate">
                        {clubNom(l.clubId)}
                        {l.equipeNom && (
                          <span className="text-faint font-normal"> · {l.equipeNom}</span>
                        )}
                      </div>
                      {l.competitionLibelle && (
                        <div className="text-[10px] text-faint truncate">
                          {l.competitionLibelle}
                          {l.poule ? ` · Poule ${l.poule}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-ink font-semibold">{l.matchs}m</div>
                      <div className="text-[10px] text-faint">
                        {l.titularisations} titu · {l.minutes}'
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
