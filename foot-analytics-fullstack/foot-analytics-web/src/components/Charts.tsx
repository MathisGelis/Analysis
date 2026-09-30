// src/components/Charts.tsx
//
// Petits composants graphiques SVG — sans dependance externe. Toutes
// les couleurs utilisent les CSS variables du theme (--turf, --danger,
// --line, etc.) pour suivre automatiquement dark/light.
//
// Astuce SVG : on utilise `currentColor` ou `rgb(var(--xxx))` direct
// dans les attributs fill/stroke. Les CSS vars sont resolues par le
// navigateur a chaque repaint.

import type { Issue } from "@/lib/types";

// Helpers couleurs : referencent les vars CSS du theme.
const C = {
  turf:   "rgb(var(--turf))",
  danger: "rgb(var(--danger))",
  sky:    "rgb(var(--sky))",
  amber:  "rgb(var(--amber))",
  line:   "rgb(var(--line))",
  faint:  "rgb(var(--faint))",
  muted:  "rgb(var(--muted))",
  bg:     "rgb(var(--bg))",
  ink:    "rgb(var(--ink))",
};

/* ----- BarsChart : 2 series superposees (BM / BC par journee) ----- */
interface BarsProps {
  data: { label: string; a: number; b: number }[];
  height?: number;
  legend?: [string, string];
  colorA?: string;
  colorB?: string;
}
export function BarsChart({
  data, height = 220, legend = ["A", "B"],
  colorA = C.turf, colorB = C.danger,
}: BarsProps) {
  if (!data.length) return null;
  const W = 720;
  const H = height;
  const pad = { l: 28, r: 8, t: 18, b: 22 };
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  const bw = (W - pad.l - pad.r) / data.length;
  const yScale = (v: number) => (v / max) * (H - pad.t - pad.b);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = pad.t + (H - pad.t - pad.b) * (1 - p);
          return (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y}
                stroke={C.line} strokeDasharray="2 4" />
              <text x={pad.l - 4} y={y + 3} textAnchor="end"
                fontSize="9" fill={C.faint}>{Math.round(max * p)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = pad.l + i * bw;
          const ha = yScale(d.a), hb = yScale(d.b);
          const ya = H - pad.b - ha, yb = H - pad.b - hb;
          return (
            <g key={i}>
              <rect x={x + 3} y={ya} width={bw / 2 - 2} height={ha}
                fill={colorA} opacity="0.95" rx="1.5" />
              <rect x={x + bw / 2 + 1} y={yb} width={bw / 2 - 2} height={hb}
                fill={colorB} opacity="0.95" rx="1.5" />
              <text x={x + bw / 2} y={H - 6} textAnchor="middle"
                fontSize="8.5" fill={C.muted}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-1 text-[11px] text-muted px-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorA }} />
          {legend[0]}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorB }} />
          {legend[1]}
        </span>
      </div>
    </div>
  );
}

/* ----- Sparkline simple ----- */
export function Sparkline({
  values, color = C.turf, height = 40, width = 120,
}: { values: number[]; color?: string; height?: number; width?: number }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const dx = width / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => {
      const y = height - ((v - min) / Math.max(max - min, 1)) * (height - 4) - 2;
      return `${i * dx},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const ly = height - ((last - min) / Math.max(max - min, 1)) * (height - 4) - 2;
  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Trace de la ligne avec leger glow turf */}
      <polyline fill="none" stroke={color} strokeWidth="1.75" points={points}
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(values.length - 1) * dx} cy={ly} r="2.6" fill={color} />
    </svg>
  );
}

/* ----- Anneau / donut ----- */
export function DonutStat({
  value, max = 100, size = 84, stroke = 8, color = C.turf, label,
}: {
  value: number; max?: number; size?: number; stroke?: number;
  color?: string; label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={C.line} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-xl font-bold text-ink leading-none">
          {Math.round(value)}
        </div>
        {label && <div className="text-[9.5px] uppercase tracking-wider text-faint mt-0.5">{label}</div>}
      </div>
    </div>
  );
}

/* ----- Forme : sequence VND ----- */
export function FormeStrip({ values }: { values: Issue[] }) {
  return (
    <div className="inline-flex gap-1">
      {values.map((v, i) => (
        <span key={i} className={
          v === "V" ? "pill-v" : v === "N" ? "pill-n" : "pill-d"
        }>{v}</span>
      ))}
    </div>
  );
}

/* ----- Heatmap simple (radar de zones de terrain : 5x4) ----- */
export function PitchHeatmap({ matrix }: { matrix: number[][] }) {
  // matrix : 5 lignes (largeur) x 4 colonnes (longueur — defense->attaque)
  const max = Math.max(...matrix.flat(), 1);
  return (
    <svg viewBox="0 0 200 130" className="w-full h-auto">
      {/* Fond terrain : surface-2 pour s'adapter dark/light */}
      <rect x="2" y="2" width="196" height="126" fill="rgb(var(--surface-2))"
        stroke={C.line} strokeWidth="1" rx="4" />
      <line x1="100" x2="100" y1="2" y2="128" stroke={C.line} />
      <circle cx="100" cy="65" r="14" fill="none" stroke={C.line} />
      <rect x="2" y="40" width="22" height="50" fill="none" stroke={C.line} />
      <rect x="176" y="40" width="22" height="50" fill="none" stroke={C.line} />
      {matrix.map((row, r) =>
        row.map((v, c) => {
          const x = 4 + c * 48;
          const y = 4 + r * 24.8;
          const a = (v / max) * 0.85;
          return (
            <rect key={`${r}-${c}`} x={x} y={y} width="46" height="23"
              fill={C.turf} opacity={a} rx="1.5" />
          );
        }),
      )}
    </svg>
  );
}
