"use client";

// src/features/analyse-jeu/components/ResumeMatchVue.tsx
//
// Le resume de fin de match (onglet « Résumé » de l'apres-match) : score, constats, chiffres compares, minutes des buts et carte des
// tirs. Lecture rapide : tout tient en un ecran de telephone defile, sans rien a regler.

import { useEffect, useState } from "react";

import { api, messageApi } from "@/shared/lib/api";
import { Spinner } from "@/shared/ui/Spinner";

import { libelleScore, partDe, phraseTranches } from "../lib/affichage-jeu";
import { CarteZones } from "./CarteZones";
import type { Constat, ResumeMatch } from "../lib/jeu-types";

const BORD: Record<Constat["ton"], string> = { bon: "rgb(var(--accent-strong))", alerte: "rgb(var(--amber))", neutre: "rgb(var(--line-strong))" };

export function ResumeMatchVue({ matchId }: { matchId: string }) {
  const [r, setR] = useState<ResumeMatch | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => { api.resumeMatch(matchId).then(setR).catch((e) => setErreur(messageApi(e, "Impossible de charger le résumé."))); }, [matchId]);

  if (erreur) return <p role="alert" className="panel-inset border-l-2 border-danger p-3 text-sm text-ink">{erreur}</p>;
  if (!r) return <div className="flex justify-center p-8" role="status" aria-label="Chargement du résumé"><Spinner taille={20} /></div>;

  const maxTranche = Math.max(1, ...r.tranches.flatMap((t) => [t.nous, t.eux]));
  const totalTirs = r.carte.tirs.reduce((s, x) => s + x, 0);

  return (
    <div className="space-y-4">
      <div className="panel flex items-center justify-between gap-3 p-4">
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-wide text-muted">Nous</div>
          <div className="font-display text-5xl font-bold leading-none text-accent" aria-label={`Score : ${libelleScore(r.score)}`}>{r.score.nous}</div>
        </div>
        <div className="min-w-0 text-center text-xs text-muted">
          <div className="font-display text-xl text-muted" aria-hidden>–</div>
          {r.sources.detail ? "Saisi en direct" : "Feuille de match seulement"}
        </div>
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-wide text-muted">Adversaire</div>
          <div className="font-display text-5xl font-bold leading-none text-sky">{r.score.eux}</div>
        </div>
      </div>

      {r.constats.length > 0 && (
        <section aria-label="Constats" className="space-y-2">
          <h2 className="h-section">À retenir</h2>
          <ul className="space-y-2">
            {r.constats.map((c) => (
              <li key={c.id} className="rounded-xl border border-l-4 border-line bg-surface px-3 py-2.5" style={{ borderLeftColor: BORD[c.ton] }}>
                <div className="text-sm font-semibold text-ink">{c.titre}</div>
                <div className="text-[13px] text-muted">{c.detail}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.stats.length > 0 && (
        <section aria-label="Le match en chiffres" className="panel space-y-1 p-4">
          <h2 className="font-display text-base font-bold text-ink">Le match en chiffres</h2>
          {r.stats.map((s) => {
            const part = partDe(s.nous, s.eux);
            return (
              <div key={s.cle} className="py-1.5">
                <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-[13px]">
                  <span className="text-right font-bold tabular-nums text-accent">{s.nous}</span>
                  <span className="text-center text-muted">{s.libelle}</span>
                  <span className="font-bold tabular-nums text-sky">{s.eux}</span>
                </div>
                <div role="img" aria-label={`${s.libelle} : ${s.nous} pour nous, ${s.eux} pour eux`} className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="bg-accentstrong" style={{ width: `${part}%` }} />
                  <div className="bg-sky" style={{ width: `${100 - part}%` }} />
                </div>
              </div>
            );
          })}
          {(r.conversion.nous !== null || r.conversion.eux !== null) && (
            <p className="pt-2 text-xs text-muted">Conversion (buts sur tirs) : {r.conversion.nous ?? "–"} % pour nous, {r.conversion.eux ?? "–"} % pour eux.</p>
          )}
        </section>
      )}

      <section aria-label="Minutes des buts" className="panel p-4">
        <h2 className="font-display text-base font-bold text-ink">Minutes des buts</h2>
        {r.butsSource === "aucune" ? (
          <p className="mt-2 text-sm text-muted">{r.score.nous + r.score.eux === 0 ? "Aucun but dans le match." : "Les minutes des buts ne sont pas connues : le match n'a pas été saisi en direct et la feuille de match ne les date pas."}</p>
        ) : (
          <>
            <div role="img" aria-label={phraseTranches(r.tranches)} className="mt-3 flex h-[120px] items-end gap-2">
              {r.tranches.map((t) => (
                <div key={t.nom} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex items-end gap-[3px]" style={{ height: 90 }} aria-hidden>
                    {([["nous", "bg-accentstrong"], ["eux", "bg-sky"]] as const).map(([cle, fond]) => (
                      <div key={cle} className="flex w-3.5 flex-col items-center justify-end" style={{ height: "100%" }}>
                        {t[cle] > 0 && <span className="text-[10px] font-bold tabular-nums text-ink">{t[cle]}</span>}
                        <div className={`${fond} w-full rounded-t`} style={{ height: `${Math.max(3, (t[cle] / maxTranche) * 70)}px`, opacity: t[cle] ? 1 : 0.25 }} />
                      </div>
                    ))}
                  </div>
                  <span className="text-[11px] text-muted" aria-hidden>{t.nom}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{r.butsSource === "fmi" ? "Minutes reprises de la feuille de match." : "Minutes saisies en direct."} Nous à gauche de chaque paire, adversaire à droite.</p>
          </>
        )}
      </section>

      {r.sources.detail && (
        <section aria-label="Carte des tirs" className="panel space-y-2 p-4">
          <h2 className="font-display text-base font-bold text-ink">Carte des tirs</h2>
          {totalTirs === 0 ? (
            <p className="text-sm text-muted">Aucun tir n&apos;a été placé sur le terrain pendant la saisie.</p>
          ) : (
            <>
              <CarteZones carte={r.carte} nom="Carte des tirs de ton équipe" />
              <p className="text-xs text-muted">Tirs de ton équipe (l&apos;attaque est en haut). Plus la case est foncée, plus il y a de tirs ; ⚽ = buts.</p>
            </>
          )}
          {r.contextes.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Tirs par contexte">
              {r.contextes.map((c) => (
                <li key={c.nom} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink">{c.nom} · {c.tirs} tir{c.tirs > 1 ? "s" : ""}{c.buts ? ` · ${c.buts} but${c.buts > 1 ? "s" : ""}` : ""}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
