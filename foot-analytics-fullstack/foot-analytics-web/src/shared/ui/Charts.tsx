"use client";
// src/shared/ui/Charts.tsx
//
// Petits graphiques SVG sans dependance. Regles de trace : marques fines
// (barres <= 14 px a bout arrondi, lignes de 2 px), grille en filet discret,
// pastille de fin avec un anneau de la couleur de fond, valeurs et libelles
// dans les jetons de texte (jamais dans la couleur de la serie). Les couleurs
// des series viennent des variables --chart-* du theme (nuit / jour).
// Chaque graphique a une alternative textuelle et une info-bulle au survol.

import { useId, useState } from "react";

import type { Issue } from "@/shared/lib/types";

const C = {
  s1: "rgb(var(--chart-1))",
  s2: "rgb(var(--chart-2))",
  accent: "rgb(var(--accent))",
  line: "rgb(var(--line))",
  surface: "rgb(var(--surface))",
  faint: "rgb(var(--faint))",
  muted: "rgb(var(--muted))",
};

/** Rectangle dont seul le bord haut est arrondi (bout de donnee ; le pied reste droit). */
function barreArrondie(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/* ----- BarsChart : 2 series par groupe (ex. buts marques / encaisses par journee) ----- */
interface BarsProps {
  data: { label: string; a: number; b: number }[];
  height?: number;
  legend?: [string, string];
  colorA?: string;
  colorB?: string;
}
export function BarsChart({
  data, height = 220, legend = ["A", "B"], colorA = C.s1, colorB = C.s2,
}: BarsProps) {
  const [survol, setSurvol] = useState<number | null>(null);
  const id = useId();
  if (!data.length) return null;
  const W = 720, H = height;
  const pad = { l: 30, r: 8, t: 14, b: 24 };
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  const bande = (W - pad.l - pad.r) / data.length;
  const epaisseur = Math.min(14, (bande - 6) / 2);          // jamais plus de 14 px : de l'air autour
  const zone = H - pad.t - pad.b;
  const haut = (v: number) => (v / max) * zone;
  const pasLabel = Math.ceil(data.length / 14);              // libelles clairsemes quand il y a beaucoup de groupes
  const ticks = [0, 0.5, 1].map((p) => Math.round(max * p));

  return (
    <div className="w-full">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
          aria-labelledby={`${id}-t`} onMouseLeave={() => setSurvol(null)}>
          <title id={`${id}-t`}>{`${legend[0]} et ${legend[1]} par groupe (${data.length} valeurs)`}</title>
          {ticks.map((t, i) => {
            const y = pad.t + zone * (1 - (max ? t / max : 0));
            return (
              <g key={i}>
                <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={C.line} strokeWidth="1" />
                <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill={C.faint}>{t}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const x0 = pad.l + i * bande + (bande - (epaisseur * 2 + 2)) / 2;
            const actif = survol === i;
            return (
              <g key={i}>
                {actif && <rect x={pad.l + i * bande} y={pad.t - 4} width={bande} height={zone + 4} rx="6" fill="rgb(var(--accent) / .08)" />}
                <path d={barreArrondie(x0, pad.t + zone - haut(d.a), epaisseur, haut(d.a))} fill={colorA} />
                <path d={barreArrondie(x0 + epaisseur + 2, pad.t + zone - haut(d.b), epaisseur, haut(d.b))} fill={colorB} />
                {i % pasLabel === 0 && (
                  <text x={pad.l + i * bande + bande / 2} y={H - 7} textAnchor="middle" fontSize="10" fill={C.muted}>{d.label}</text>
                )}
                {/* Zone de survol plus large que les barres. */}
                <rect x={pad.l + i * bande} y={0} width={bande} height={H} fill="transparent"
                  onMouseEnter={() => setSurvol(i)} onFocus={() => setSurvol(i)} tabIndex={-1} />
              </g>
            );
          })}
        </svg>
        {survol !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl border border-line bg-panel px-3 py-2 text-xs shadow-pop"
            style={{ left: `${((pad.l + survol * bande + bande / 2) / W) * 100}%` }}
          >
            <div className="mb-1 font-semibold text-ink">{data[survol].label}</div>
            <div className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: colorA }} />{legend[0]} <b className="ml-auto pl-3 text-ink tabular-nums">{data[survol].a}</b></div>
            <div className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: colorB }} />{legend[1]} <b className="ml-auto pl-3 text-ink tabular-nums">{data[survol].b}</b></div>
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-4 px-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorA }} />{legend[0]}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorB }} />{legend[1]}</span>
      </div>
      {/* Vue tableau pour les lecteurs d'ecran. */}
      <table className="sr-only">
        <caption>{legend[0]} et {legend[1]}</caption>
        <thead><tr><th>Groupe</th><th>{legend[0]}</th><th>{legend[1]}</th></tr></thead>
        <tbody>{data.map((d, i) => <tr key={i}><td>{d.label}</td><td>{d.a}</td><td>{d.b}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/* ----- Sparkline : ligne de 2 px, voile de 10 %, pastille de fin cerclee de la couleur de fond ----- */
export function Sparkline({
  values, color = C.s1, height = 40, width = 120, area = true,
}: { values: number[]; color?: string; height?: number; width?: number; area?: boolean }) {
  const id = useId();
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const dx = width / Math.max(values.length - 1, 1);
  const y = (v: number) => height - 6 - ((v - min) / Math.max(max - min, 1)) * (height - 12);
  const pts = values.map((v, i) => `${(i * dx).toFixed(1)},${y(v).toFixed(1)}`);
  const dernier = values.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" role="img"
      style={{ maxWidth: "100%", height: "auto" }}
      aria-label={`Evolution sur ${values.length} valeurs, derniere : ${values[dernier]}`}>
      {area && values.length > 1 && (
        <>
          <defs>
            <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity=".22" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,${height} ${pts.join(" ")} ${(dernier * dx).toFixed(1)},${height}`} fill={`url(#${id}-a)`} />
        </>
      )}
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts.join(" ")} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={dernier * dx} cy={y(values[dernier])} r="4" fill={color} stroke={C.surface} strokeWidth="2" />
    </svg>
  );
}

/* ----- Anneau : progression sur un cercle, valeur au centre ----- */
export function DonutStat({
  value, max = 100, size = 84, stroke = 8, color = C.s1, label,
}: {
  value: number; max?: number; size?: number; stroke?: number;
  color?: string; label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}
      role="img" aria-label={`${Math.round(value)} sur ${max}${label ? ` ${label}` : ""}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-xl font-bold leading-none text-ink">{Math.round(value)}</div>
        {label && <div className="mt-0.5 text-[10px] font-medium text-faint">{label}</div>}
      </div>
    </div>
  );
}

/* ----- Forme : sequence V / N / D ----- */
export function FormeStrip({ values }: { values: Issue[] }) {
  return (
    <div className="inline-flex gap-1" role="img" aria-label={`Forme : ${values.join(" ")}`}>
      {values.map((v, i) => (
        <span key={i} className={v === "V" ? "pill-v" : v === "N" ? "pill-n" : "pill-d"}>{v}</span>
      ))}
    </div>
  );
}

/* ----- Carte de chaleur simple (zones de terrain 5 x 4) ----- */
export function PitchHeatmap({ matrix }: { matrix: number[][] }) {
  // matrix : 5 lignes (largeur) x 4 colonnes (longueur, defense -> attaque)
  const max = Math.max(...matrix.flat(), 1);
  return (
    <svg viewBox="0 0 200 130" className="h-auto w-full" role="img" aria-label="Carte de chaleur du terrain">
      <rect x="2" y="2" width="196" height="126" fill="rgb(var(--surface-2))" stroke={C.line} strokeWidth="1" rx="8" />
      <line x1="100" x2="100" y1="2" y2="128" stroke={C.line} />
      <circle cx="100" cy="65" r="14" fill="none" stroke={C.line} />
      <rect x="2" y="40" width="22" height="50" fill="none" stroke={C.line} />
      <rect x="176" y="40" width="22" height="50" fill="none" stroke={C.line} />
      {matrix.map((row, r) =>
        row.map((v, c) => (
          <rect key={`${r}-${c}`} x={4 + c * 48} y={4 + r * 24.8} width="46" height="23"
            fill={C.s1} opacity={(v / max) * 0.85} rx="4" />
        )),
      )}
    </svg>
  );
}
