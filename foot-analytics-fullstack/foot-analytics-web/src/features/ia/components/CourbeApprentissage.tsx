"use client";
// src/features/ia/components/CourbeApprentissage.tsx
//
// La courbe d'apprentissage : pour chaque semaine de matchs, la part des titulaires bien predits (ou des postes exacts)
// par l'IA et par les trois methodes simples de reference, calculee AVANT de decouvrir la semaine. Quatre traits qui se
// distinguent par leur style (plein, tirets, points) et pas seulement par leur couleur ; info-bulle au survol.

import { useEffect, useId, useRef, useState } from "react";

import { bornesCourbe, coupuresDeCourbe, LIBELLE_METHODE, METHODES, moisCourt, pct, serieCourbe } from "@/features/ia/lib/ia-format";
import type { Mesure, Methode, PointCourbe } from "@/features/ia/lib/ia-types";

const STYLE: Record<Methode, { couleur: string; epaisseur: number; trait?: string }> = {
  modele: { couleur: "rgb(var(--chart-1))", epaisseur: 2.5 },
  moteur: { couleur: "rgb(var(--chart-3))", epaisseur: 1.5, trait: "7 4" },
  dernier: { couleur: "rgb(var(--chart-2))", epaisseur: 1.5, trait: "2 4" },
  frequence: { couleur: "rgb(var(--muted))", epaisseur: 1.5, trait: "10 3 2 3" },
};

export function CourbeApprentissage({ courbe, mesure, hauteur = 260 }: { courbe: PointCourbe[]; mesure: Mesure; hauteur?: number }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [largeur, setLargeur] = useState(720);
  const conteneur = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const el = conteneur.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const mesurer = () => setLargeur(Math.max(300, Math.min(1000, Math.round(el.clientWidth))));
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Sans les premieres semaines vides : personne n'a d'historique, il n'y a rien a predire.
  const debut = courbe.findIndex((p) => p.n > 0);
  const points = debut < 0 ? [] : courbe.slice(debut);
  const n = points.length;
  if (n === 0) return <p className="text-sm text-muted">Aucune semaine n'a pu etre predite.</p>;

  const series = METHODES.map((m) => ({ m, valeurs: serieCourbe(points, m, mesure) }));
  const { min, max } = bornesCourbe(series.flatMap((s) => s.valeurs));
  const W = largeur, H = hauteur;
  const pad = { l: 40, r: 14, t: 14, b: 34 };
  const zone = { w: W - pad.l - pad.r, h: H - pad.t - pad.b };
  const x = (i: number) => pad.l + (n === 1 ? zone.w / 2 : (i / (n - 1)) * zone.w);
  const y = (v: number) => pad.t + zone.h * (1 - (v - min) / (max - min));
  const nbTicks = 4;
  const ticks = Array.from({ length: nbTicks + 1 }, (_, i) => min + ((max - min) * i) / nbTicks);
  const pasLabel = Math.ceil(n / Math.max(3, Math.floor(zone.w / 70)));
  const coupures = coupuresDeCourbe(points);

  /** Un trait par suite de semaines consecutives qui ont une valeur (un trou coupe la ligne). */
  const chemin = (valeurs: (number | null)[]) => {
    let d = "";
    let ouvert = false;
    valeurs.forEach((v, i) => {
      if (v === null || coupures.includes(i)) ouvert = false;      // un trou, ou l'inter-saison : la ligne repart
      if (v === null) return;
      d += `${ouvert ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      ouvert = true;
    });
    return d.trim();
  };

  const survolDe = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = n === 1 ? 0 : Math.round(((px - pad.l) / zone.w) * (n - 1));
    setSurvol(Math.max(0, Math.min(n - 1, i)));
  };
  const actif = survol !== null ? points[survol] : null;
  const moyenneModele = (() => {
    const v = series[0].valeurs.filter((q): q is number => q !== null);
    return v.length ? v.reduce((s, q) => s + q, 0) / v.length : null;
  })();

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="Legende">
        {METHODES.map((m) => (
          <li key={m} className="inline-flex items-center gap-2">
            <svg width="30" height="8" aria-hidden>
              <line x1="1" x2="29" y1="4" y2="4" stroke={STYLE[m].couleur} strokeWidth={STYLE[m].epaisseur} strokeDasharray={STYLE[m].trait} strokeLinecap="round" />
            </svg>
            <span className={m === "modele" ? "font-semibold text-ink" : ""}>{LIBELLE_METHODE[m]}</span>
          </li>
        ))}
      </ul>

      <div ref={conteneur} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
          onMouseMove={survolDe} onMouseLeave={() => setSurvol(null)}>
          <title id={`${id}-t`}>{mesure === "onze" ? "Titulaires bien predits" : "Postes exacts"} par semaine, IA et methodes de reference</title>
          <desc id={`${id}-d`}>
            {`${n} semaines. Moyenne de l'IA : ${pct(moyenneModele)}.`}
          </desc>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth="1" />
              <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="rgb(var(--faint))">{Math.round(t * 100)} %</text>
            </g>
          ))}
          {points.map((p, i) => i % pasLabel === 0 && (
            <text key={p.etape} x={x(i)} y={H - 12} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">
              {moisCourt(p.libelle)}
            </text>
          ))}
          {coupures.map((i) => (
            <g key={`coupure-${i}`}>
              <line x1={(x(i) + x(i - 1)) / 2} x2={(x(i) + x(i - 1)) / 2} y1={pad.t} y2={pad.t + zone.h} stroke="rgb(var(--line-strong))" strokeWidth="1" strokeDasharray="3 4" />
              <text x={(x(i) + x(i - 1)) / 2 + 4} y={pad.t + 9} fontSize="9" fill="rgb(var(--faint))">nouvelle saison</text>
            </g>
          ))}
          {actif && survol !== null && (
            <line x1={x(survol)} x2={x(survol)} y1={pad.t} y2={pad.t + zone.h} stroke="rgb(var(--accent) / .45)" strokeWidth="1" />
          )}
          {[...series].reverse().map(({ m, valeurs }) => (
            <path key={m} d={chemin(valeurs)} fill="none" stroke={STYLE[m].couleur} strokeWidth={STYLE[m].epaisseur}
              strokeDasharray={STYLE[m].trait} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {actif && survol !== null && series.map(({ m, valeurs }) => valeurs[survol] !== null && (
            <circle key={m} cx={x(survol)} cy={y(valeurs[survol]!)} r={m === "modele" ? 4 : 3} fill={STYLE[m].couleur} stroke="rgb(var(--surface))" strokeWidth="2" />
          ))}
        </svg>

        {actif && survol !== null && (
          <div role="status" className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl border border-line2/60 bg-panel p-3 text-xs shadow-pop"
            style={{ left: `${Math.min(Math.max((x(survol) / W) * 100, 24), 76)}%`, transform: "translateX(-50%)" }}>
            <div className="font-semibold text-ink">{actif.libelle}</div>
            <div className="mb-1.5 text-faint">{actif.journees ? `${actif.journees} · ` : ""}{actif.n} compositions predites</div>
            {METHODES.map((m) => (
              <div key={m} className="flex items-center justify-between gap-3">
                <span className={m === "modele" ? "font-semibold text-ink" : "text-muted"}>{LIBELLE_METHODE[m]}</span>
                <span className="font-mono text-ink">{pct(actif[m][mesure])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
