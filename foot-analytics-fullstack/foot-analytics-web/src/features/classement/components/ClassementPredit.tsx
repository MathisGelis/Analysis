"use client";
// src/features/classement/components/ClassementPredit.tsx
//
// Classement final predit : la fin de saison est simulee des milliers de fois (matchs joues acquis, double confrontation
// restante tiree avec les buts attendus du modele de score). Chargee a l'ouverture de l'onglet seulement. Les zones de montee
// et de relegation sont au choix de l'utilisateur et memorisees sur l'appareil.

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/shared/lib/api";
import { ClubBadge } from "@/features/clubs/components/ClubBadge";
import type { ClassementPredit as Donnees } from "@/shared/lib/types";

import { chancesBas, chancesHaut, pctChance, placesValides } from "../lib/zones-predites";

const CLE_ZONES = "fa.zones.classement";

export function ClassementPredit({ equipeId, ownClubId }: { equipeId: string | null; ownClubId: string }) {
  const [donnees, setDonnees] = useState<Donnees | null | undefined>(undefined);
  const [erreur, setErreur] = useState(false);
  const [haut, setHaut] = useState(0);
  const [bas, setBas] = useState(0);

  useEffect(() => {
    try {
      const z = JSON.parse(localStorage.getItem(CLE_ZONES) ?? "{}") as { haut?: unknown; bas?: unknown };
      setHaut(placesValides(z.haut, 40)); setBas(placesValides(z.bas, 40));
    } catch { /* stockage indisponible : pas de zones */ }
  }, []);
  useEffect(() => {
    if (!equipeId) { setDonnees(null); return; }
    let actif = true;
    api.classementPredit(equipeId).then((d) => { if (actif) setDonnees(d); }).catch(() => { if (actif) setErreur(true); });
    return () => { actif = false; };
  }, [equipeId]);

  const memoriser = (h: number, b: number) => { try { localStorage.setItem(CLE_ZONES, JSON.stringify({ haut: h, bas: b })); } catch { /* facultatif */ } };

  if (erreur) return <div className="panel-inset p-4 text-sm text-muted">Le classement prédit n'a pas pu être calculé. Réessayez dans un instant.</div>;
  if (donnees === undefined) return <div className="panel-inset p-4 text-sm text-muted">Simulation de la fin de saison…</div>;
  if (!donnees) {
    return <div className="panel-inset p-4 text-sm text-muted">Pas assez d'équipes dans ce championnat pour prédire un classement.</div>;
  }

  const n = donnees.equipes.length;
  const h = placesValides(haut, n), b = placesValides(bas, n);
  const champ = (libelle: string, valeur: number, set: (v: number) => void, autre: "haut" | "bas") => (
    <label className="flex items-center gap-2 text-xs text-muted">
      {libelle}
      <input type="number" min={0} max={Math.floor(n / 2)} value={valeur || ""} placeholder="0"
        onChange={(e) => {
          const v = placesValides(e.target.value, n);
          set(v);
          memoriser(autre === "haut" ? v : h, autre === "bas" ? v : b);
        }}
        className="inp w-16 text-center" aria-label={libelle} />
    </label>
  );

  return (
    <section className="panel p-5" data-testid="classement-predit">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="h-section">Classement final prédit</div>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            {donnees.simulations.toLocaleString("fr-FR")} fins de saison simulées. Les {donnees.matchsJoues} matchs joués sont acquis ;
            les {donnees.matchsRestants} restants (chaque équipe en rencontre chaque autre deux fois) sont tirés d'après les buts
            attendus par {donnees.source === "ia" ? `l'IA (${donnees.modele ?? "modèle actif"})` : "un modèle de Poisson sur les moyennes de buts lissées"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {champ("Places de montée", haut, setHaut, "haut")}
          {champ("Places de descente", bas, setBas, "bas")}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-fm">
          <thead>
            <tr>
              <th>#</th>
              <th>Club</th>
              <th className="text-center" title="Rang et points aujourd'hui">Actuel</th>
              <th className="text-right" title="Points finaux attendus (fourchette : 10 % à 90 % des simulations)">Pts finaux</th>
              <th className="text-center max-sm:hidden" title="Rang final le plus fréquent">Rang probable</th>
              <th className="text-right" title="Chances de finir premier">Titre</th>
              {h > 0 && <th className="text-right" title={`Chances de finir dans les ${h} premiers`}>Top {h}</th>}
              {b > 0 && <th className="text-right" title={`Chances de finir dans les ${b} derniers`}>Bas {b}</th>}
            </tr>
          </thead>
          <tbody>
            {donnees.equipes.map((e, i) => (
              <tr key={e.equipeId} className={e.clubId === ownClubId ? "is-mine" : ""} data-testid="ligne-predite">
                <td className="font-mono text-muted">{i + 1}</td>
                <td>
                  <Link href={`/club/${e.clubId}`} className="flex items-center gap-2 hover:text-accent">
                    <ClubBadge clubId={e.clubId} size={22} />
                    <span className="text-sm">{e.nom}</span>
                  </Link>
                </td>
                <td className="text-center tabular-nums text-muted">{e.actuel.rang}ᵉ · {e.actuel.pts} pts</td>
                <td className="text-right tabular-nums">
                  <span className="font-display font-bold">{Math.round(e.ptsAttendus)}</span>
                  <span className="ml-1 text-[11px] text-faint">({e.ptsBas}–{e.ptsHaut})</span>
                </td>
                <td className="text-center tabular-nums max-sm:hidden">{e.rangProbable}ᵉ</td>
                <td className="text-right tabular-nums">{pctChance(e.rangs[0] ?? 0)}</td>
                {h > 0 && <td className="text-right tabular-nums text-win">{pctChance(chancesHaut(e.rangs, h))}</td>}
                {b > 0 && <td className="text-right tabular-nums text-loss">{pctChance(chancesBas(e.rangs, b))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Une estimation, pas une certitude : elle ignore les blessures à venir, les forfaits et le départage complet de la FFF (confrontations directes).
        La fourchette de points couvre 8 simulations sur 10.
      </p>
    </section>
  );
}
