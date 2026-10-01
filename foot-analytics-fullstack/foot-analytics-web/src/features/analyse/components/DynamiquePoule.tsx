// src/features/analyse/components/DynamiquePoule.tsx
//
// Qui monte, qui coule dans la poule : classement enrichi de la forme recente (5 derniers
// resultats), du sens de la tendance (points, attaque, defense) et de la serie en cours.
// Une equipe n'est jugee qu'avec assez de matchs (sinon "Trop tot", cf. moteur de tendances).

import Link from "next/link";
import { ArrowUpRight, Flame, Snowflake } from "lucide-react";

import { ClubBadge } from "@/features/clubs/components/ClubBadge";
import { FormeStrip } from "@/shared/ui/Charts";
import type { DynamiqueEquipe, DynamiquePoule as DonneesPoule } from "@/features/analyse/lib/analyse-types";
import { decimal, libelleSerie, serieFavorable } from "@/features/analyse/lib/tendances-format";

import { PastilleSens } from "./PastilleSens";

function Podium({
  titre, icone, equipes, ton,
}: { titre: string; icone: React.ReactNode; equipes: DynamiqueEquipe[]; ton: "text-win" | "text-loss" }) {
  if (equipes.length === 0) return null;
  return (
    <div className="panel-inset p-3.5">
      <div className={`h-section mb-2 flex items-center gap-2 ${ton}`}>{icone}{titre}</div>
      <ul className="space-y-1.5">
        {equipes.map((e) => (
          <li key={e.equipeId} className="flex items-center gap-2.5 text-sm">
            <ClubBadge clubId={e.clubId} size={22} />
            <Link href={`/rapports/equipe/${e.clubId}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-accent">{e.nom}</Link>
            <span className={`text-xs font-semibold tabular-nums ${ton}`}>{decimal(e.ecartPpm, 2, true)} pt/m</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DynamiquePoule({ poule, equipeId }: { poule: DonneesPoule; equipeId: string | null }) {
  const equipes = [...poule.equipes].sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99));
  const jugees = equipes.filter((e) => e.sens !== "insuffisant");
  const enForme = [...jugees].filter((e) => e.sens === "hausse").sort((a, b) => b.ecartPpm - a.ecartPpm).slice(0, 3);
  const enDifficulte = [...jugees].filter((e) => e.sens === "baisse").sort((a, b) => a.ecartPpm - b.ecartPpm).slice(0, 3);

  return (
    <div className="space-y-4">
      {(enForme.length > 0 || enDifficulte.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Podium titre="En pleine montee" icone={<Flame size={12} aria-hidden />} equipes={enForme} ton="text-win" />
          <Podium titre="En perte de vitesse" icone={<Snowflake size={12} aria-hidden />} equipes={enDifficulte} ton="text-loss" />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table-fm table-dense w-full">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Equipe</th>
              <th className="text-right">Pts</th>
              <th className="hidden md:table-cell">5 derniers</th>
              <th className="text-right">Pt/match</th>
              <th>Tendance</th>
              <th className="hidden lg:table-cell">Attaque</th>
              <th className="hidden lg:table-cell">Defense</th>
              <th className="hidden min-[1500px]:table-cell">Serie</th>
            </tr>
          </thead>
          <tbody>
            {equipes.map((e) => (
              <tr key={e.equipeId} className={e.equipeId === equipeId ? "is-mine" : ""}>
                <td className="tabular-nums text-muted">{e.rang ?? "—"}</td>
                <td>
                  <Link href={`/rapports/equipe/${e.clubId}`} className="group flex items-center gap-2.5 font-semibold text-ink hover:text-accent">
                    <ClubBadge clubId={e.clubId} size={24} />
                    <span className="max-w-[12rem] truncate">{e.nom}</span>
                    <ArrowUpRight size={12} className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </Link>
                </td>
                <td className="text-right font-display font-bold tabular-nums">{e.pts ?? "—"}</td>
                <td className="hidden md:table-cell">
                  {e.formeRecente.length > 0 ? <FormeStrip values={e.formeRecente} /> : <span className="text-faint">—</span>}
                </td>
                <td className="text-right tabular-nums">
                  {e.sens === "insuffisant" ? <span className="text-faint">{decimal(e.ppmSaison, 2)}</span> : (
                    <>
                      <span className="text-faint">{decimal(e.ppmSaison, 2)}</span>
                      <span className="mx-1 text-faint">→</span>
                      <span className="font-semibold text-ink">{decimal(e.ppmRecent, 2)}</span>
                    </>
                  )}
                </td>
                <td><PastilleSens sens={e.sens} /></td>
                <td className="hidden lg:table-cell">{e.sens === "insuffisant" ? <span className="text-faint">—</span> : <PastilleSens sens={e.attaque} />}</td>
                <td className="hidden lg:table-cell">{e.sens === "insuffisant" ? <span className="text-faint">—</span> : <PastilleSens sens={e.defense} />}</td>
                <td className={`hidden text-xs min-[1500px]:table-cell ${e.serie ? (serieFavorable(e.serie.type) ? "text-win" : "text-loss") : "text-faint"}`}>
                  {e.serie ? libelleSerie(e.serie.type, e.serie.longueur) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-faint">
        Tendance : points par match sur les derniers matchs contre le reste de la saison. Attaque et defense comparent les buts marques et encaisses.
      </p>
    </div>
  );
}
