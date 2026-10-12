"use client";
// src/features/analyse/components/CourbeGlissante.tsx
//
// Courbe d'une moyenne glissante sur les matchs d'une equipe, avec la moyenne de
// saison en repere, une rangee de resultats (V / N / D) sous la courbe et une
// info-bulle au survol qui detaille le match. Marques fines (ligne de 2 px, pastille
// cerclee de la couleur de fond), grille en filet, textes dans les jetons de texte.

import { useEffect, useId, useRef, useState } from "react";

import type { PointCourbe } from "@/features/analyse/lib/analyse-types";
import { decimal } from "@/features/analyse/lib/tendances-format";

export interface SerieCourbe {
  label: string;
  valeurs: number[];
  /** Variable de couleur de serie, ex. "--chart-1". */
  variable: "--chart-1" | "--chart-2" | "--chart-3";
}

const COULEUR_ISSUE = { V: "rgb(var(--win))", N: "rgb(var(--draw))", D: "rgb(var(--loss))" } as const;

export function CourbeGlissante({
  points, series, yMax, reference, noms, unite, hauteur = 240,
}: {
  points: PointCourbe[];
  series: SerieCourbe[];
  yMax: number;
  reference?: { label: string; valeur: number };
  /** Noms des clubs par identifiant (une fonction ne traverse pas la frontiere serveur / client). */
  noms: Record<string, string>;
  unite: string;
  hauteur?: number;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  // Largeur reelle du conteneur : le dessin est calcule a cette largeur pour que les textes
  // gardent leur taille sur mobile au lieu d'etre reduits avec le viewBox.
  const [largeur, setLargeur] = useState(720);
  const conteneur = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = conteneur.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const mesurer = () => setLargeur(Math.max(280, Math.min(960, Math.round(el.clientWidth))));
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const id = useId();
  const n = points.length;
  if (n === 0) return null;
  const nomClub = (clubId: string | null) => (clubId ? noms[clubId] : undefined) ?? "adversaire";

  const W = largeur, H = hauteur;
  const pad = { l: 34, r: 14, t: 16, b: 46 };
  const zone = { w: W - pad.l - pad.r, h: H - pad.t - pad.b };
  const x = (i: number) => pad.l + (n === 1 ? zone.w / 2 : (i / (n - 1)) * zone.w);
  const y = (v: number) => pad.t + zone.h * (1 - Math.min(v, yMax) / yMax);
  const ticks = [0, yMax / 2, yMax];
  const pasLabel = Math.ceil(n / Math.max(4, Math.floor(zone.w / 34)));
  const chemin = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const couleur = (v: SerieCourbe["variable"]) => `rgb(var(${v}))`;

  return (
    <div ref={conteneur} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-t`}
        onMouseLeave={() => setSurvol(null)}>
        <title id={`${id}-t`}>{series.map((s) => s.label).join(" et ")} sur {n} matchs</title>
        <defs>
          <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={couleur(series[0].variable)} stopOpacity=".2" />
            <stop offset="1" stopColor={couleur(series[0].variable)} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="rgb(var(--faint))">{decimal(t, t % 1 ? 1 : 0)}</text>
          </g>
        ))}

        {reference && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(reference.valeur)} y2={y(reference.valeur)} stroke="rgb(var(--muted))" strokeWidth="1" opacity=".7" />
            <text x={W - pad.r} y={y(reference.valeur) + (series[0].valeurs[n - 1] >= reference.valeur ? 13 : -5)} textAnchor="end" fontSize="10" fill="rgb(var(--muted))" stroke="rgb(var(--surface))" strokeWidth="3" paintOrder="stroke">
              {reference.label} {decimal(reference.valeur, 2)}
            </text>
          </g>
        )}

        {survol !== null && (
          <line x1={x(survol)} x2={x(survol)} y1={pad.t} y2={pad.t + zone.h + 6} stroke="rgb(var(--line-strong))" strokeWidth="1" />
        )}

        {n > 1 && <path d={`${chemin(series[0].valeurs)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}-a)`} />}
        {series.map((s) => (
          <g key={s.label}>
            <path d={chemin(s.valeurs)} fill="none" stroke={couleur(s.variable)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {/* Pastille de fin, cerclee de la couleur de fond. */}
            <circle cx={x(n - 1)} cy={y(s.valeurs[n - 1])} r="4.5" fill={couleur(s.variable)} stroke="rgb(var(--surface))" strokeWidth="2" />
            {survol !== null && (
              <circle cx={x(survol)} cy={y(s.valeurs[survol])} r="4.5" fill={couleur(s.variable)} stroke="rgb(var(--surface))" strokeWidth="2" />
            )}
          </g>
        ))}

        {/* Rangee de resultats : une pastille par match. */}
        {points.map((p, i) => (
          <g key={p.matchId}>
            <circle cx={x(i)} cy={H - pad.b + 20} r="4" fill={COULEUR_ISSUE[p.issue]} opacity={survol === null || survol === i ? 1 : 0.55} />
            {i % pasLabel === 0 && (
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">
                {(p.journee ?? "").replace(/\D/g, "") || i + 1}
              </text>
            )}
            <rect x={x(i) - (zone.w / Math.max(n - 1, 1)) / 2} y={0} width={zone.w / Math.max(n - 1, 1)} height={H} fill="transparent"
              onMouseEnter={() => setSurvol(i)} />
          </g>
        ))}
      </svg>

      {survol !== null && (
        <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-line bg-panel px-3 py-2 text-xs shadow-pop"
          style={{ left: `clamp(70px, ${(x(survol) / W) * 100}%, calc(100% - 70px))` }}>
          <div className="mb-1 flex items-center gap-2 font-semibold text-ink">
            <span className="h-2 w-2 rounded-full" style={{ background: COULEUR_ISSUE[points[survol].issue] }} />
            J{(points[survol].journee ?? "").replace(/\D/g, "") || survol + 1} · {points[survol].domicile ? "vs" : "@"} {nomClub(points[survol].adversaireId)}
          </div>
          <div className="text-muted">Score <b className="text-ink tabular-nums">{points[survol].bp}-{points[survol].bc}</b></div>
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: couleur(s.variable) }} />
              {s.label} <b className="ml-auto pl-3 text-ink tabular-nums">{decimal(s.valeurs[survol], 2)}</b>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-muted">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: couleur(s.variable) }} />{s.label}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-3">
          {(["V", "N", "D"] as const).map((i) => (
            <span key={i} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COULEUR_ISSUE[i] }} />{i === "V" ? "Victoire" : i === "N" ? "Nul" : "Defaite"}</span>
          ))}
        </span>
      </div>

      <table className="sr-only">
        <caption>{series.map((s) => s.label).join(" et ")} ({unite})</caption>
        <thead><tr><th>Match</th><th>Score</th>{series.map((s) => <th key={s.label}>{s.label}</th>)}</tr></thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.matchId}><td>J{p.journee}</td><td>{p.bp}-{p.bc}</td>{series.map((s) => <td key={s.label}>{s.valeurs[i]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
