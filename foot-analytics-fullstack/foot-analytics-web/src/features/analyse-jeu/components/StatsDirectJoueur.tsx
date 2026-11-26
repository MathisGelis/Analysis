"use client";
// src/features/analyse-jeu/components/StatsDirectJoueur.tsx
//
// Les stats d'un joueur de mon club tirees du jeu saisi en direct (onglet « Stats » de sa fiche) : tout ce qui lui est attribue en
// direct (ses tirs, buts, passes, arrets, cartons...) atterrit ici, avec la carte de ses tirs et de leurs zones dans la cage.

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, messageApi } from "@/shared/lib/api";
import { Spinner } from "@/shared/ui/Spinner";

import { nb, pc, signe } from "../lib/format-hub";
import type { ReponseStatsJoueur } from "../lib/data-hub-types";
import { CarteTirs } from "./CarteTirs";

function Tuile({ libelle, valeur, detail }: { libelle: string; valeur: string | number; detail?: string }) {
  return (
    <div className="panel-inset p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">{libelle}</div>
      <div className="font-display text-2xl font-bold tabular-nums text-ink">{valeur}</div>
      {detail && <div className="text-[11px] text-faint">{detail}</div>}
    </div>
  );
}

export function StatsDirectJoueur({ joueurId, saisonId, nomSaison }: { joueurId: string; saisonId?: string | null; nomSaison?: string | null }) {
  const [r, setR] = useState<ReponseStatsJoueur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    api.statsJoueurDirect(joueurId, saisonId).then((x) => { if (vivant) setR(x); }).catch((e) => { if (vivant) setErreur(messageApi(e, "Impossible de charger les stats du direct.")); });
    return () => { vivant = false; };
  }, [joueurId, saisonId]);

  if (erreur) return <p role="alert" className="panel-inset border-l-2 border-danger p-3 text-sm text-ink">{erreur}</p>;
  if (!r) return <div className="flex justify-center p-6" role="status" aria-label="Chargement des stats du direct"><Spinner taille={18} /></div>;
  const s = r.stats;

  return (
    <section aria-labelledby="titre-stats-direct" className="panel space-y-4 p-5" data-testid="stats-direct-joueur">
      <h2 id="titre-stats-direct" className="h-section">Stats du direct · {nomSaison ?? "saison"}</h2>
      {s.matchs === 0 ? (
        <p className="text-sm text-muted">
          Rien n&apos;est attribué à ce joueur dans les {r.matchsSaisis} match{r.matchsSaisis > 1 ? "s" : ""} saisi{r.matchsSaisis > 1 ? "s" : ""} en direct cette saison.
          Désigne-le (tireur, passeur, gardien, fautif…) pendant la saisie pour que ses actions apparaissent ici.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">Sur {s.matchs} match{s.matchs > 1 ? "s" : ""} saisi{s.matchs > 1 ? "s" : ""} en direct où il apparaît (sur {r.matchsSaisis} saisis).</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tuile libelle="Buts" valeur={s.buts} detail={`${nb(s.xg, 2)} xG estimé · ${signe(s.buts - s.xg)}`} />
            <Tuile libelle="Passes décisives" valeur={s.passes} detail={`${s.passesCles} passe${s.passesCles > 1 ? "s" : ""} clé${s.passesCles > 1 ? "s" : ""}`} />
            <Tuile libelle="Tirs" valeur={s.tirs} detail={`${s.cadres} cadré${s.cadres > 1 ? "s" : ""} · ${pc(s.tirs ? Math.round((s.cadres / s.tirs) * 100) : null)}`} />
            <Tuile libelle="Conversion" valeur={pc(s.tirs ? Math.round((s.buts / s.tirs) * 100) : null)} detail={`${nb(s.tirs ? s.xg / s.tirs : null, 2)} xG par tir`} />
            <Tuile libelle="Penaltys" valeur={`${s.penaltys.marques}/${s.penaltys.tires}`} detail="marqués / tirés" />
            <Tuile libelle="Coups francs" valeur={`${s.coupsFrancs.buts}/${s.coupsFrancs.tires}`} detail="buts / tirés" />
            <Tuile libelle="Corners tirés" valeur={s.corners} />
            <Tuile libelle="Arrêts" valeur={s.arrets} detail="comme gardien" />
            <Tuile libelle="Fautes" valeur={s.fautes} detail={`${s.horsJeux} hors-jeu${s.horsJeux > 1 ? "x" : ""}`} />
            <Tuile libelle="Cartons" valeur={`${s.jaunes} · ${s.rouges}`} detail="jaunes · rouges" />
            <Tuile libelle="Remplacements" valeur={`${s.entrees} ↑ ${s.sorties} ↓`} detail="entrées · sorties" />
            <Tuile libelle="Blessures" valeur={s.blessures} detail="notées en direct" />
          </div>

          {s.tirsDetail.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Ses tirs</h3>
              <CarteTirs nous={s.tirsDetail} equipeNous="Ses tirs" />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="table-fm">
              <thead><tr><th>Match</th><th className="text-center">Score</th><th className="text-center">B</th><th className="text-center">PD</th><th className="text-center">Tirs</th><th className="text-center max-sm:hidden">Cadrés</th><th className="text-right max-sm:hidden">xG</th><th className="text-center max-sm:hidden">Arrêts</th><th className="text-center max-sm:hidden">Fautes</th><th className="text-center">Cartons</th></tr></thead>
              <tbody>
                {s.parMatch.map((m) => (
                  <tr key={m.matchId}>
                    <td><Link href={`/matchs/${m.matchId}`} className="hover:text-accent">{m.date ?? ""} · {m.domicile ? "vs" : "@"} {m.adversaire}</Link></td>
                    <td className="text-center tabular-nums">{m.bp}–{m.bc}</td>
                    <td className="text-center tabular-nums">{m.buts || ""}</td>
                    <td className="text-center tabular-nums">{m.passes || ""}</td>
                    <td className="text-center tabular-nums">{m.tirs || ""}</td>
                    <td className="text-center tabular-nums max-sm:hidden">{m.cadres || ""}</td>
                    <td className="text-right tabular-nums max-sm:hidden">{m.tirs ? nb(m.xg, 2) : ""}</td>
                    <td className="text-center tabular-nums max-sm:hidden">{m.arrets || ""}</td>
                    <td className="text-center tabular-nums max-sm:hidden">{m.fautes || ""}</td>
                    <td className="text-center text-xs">{m.jaunes > 0 && <span className="text-amber">CJ</span>}{m.rouges > 0 && <span className="ml-1 text-danger">CR</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-faint">xG : estimation d&apos;après la zone et le contexte du tir saisis, pas une mesure de fournisseur. B = buts, PD = passes décisives.</p>
        </>
      )}
    </section>
  );
}
