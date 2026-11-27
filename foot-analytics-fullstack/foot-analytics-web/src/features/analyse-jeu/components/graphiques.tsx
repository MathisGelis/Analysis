// src/features/analyse-jeu/components/graphiques.tsx
//
// Les graphiques du Data Hub, en SVG sans dependance : camembert (anneau), barres horizontales, barres par tranche de 15 minutes, radar
// (base 100 : la saison), courbes par match, carte de valeurs du terrain. Chacun porte une alternative textuelle (role="img" + label).
// Les couleurs viennent des jetons du theme : lisibles en mode nuit et en mode jour.

import { cheminAnneau, echelleCourbe, maxRond, pointsRadar, tranchesCamembert, versPoints } from "../lib/geometrie-graphiques";
import { intensite } from "../lib/affichage-jeu";

export const PALETTE = [
  "rgb(var(--chart-1))", "rgb(var(--chart-3))", "rgb(var(--win))", "rgb(var(--amber))", "rgb(var(--chart-2))", "rgb(var(--faint))",
];
export const couleurDe = (i: number) => PALETTE[i % PALETTE.length];

const fr = (x: number, d = 2) => x.toFixed(d).replace(".", ",");

/* ----------------------------------------- camembert (anneau) ----------------------------------------- */
export interface Part { libelle: string; valeur: number; detail?: string }

export function Camembert({ parts, titre, centre, unite = "" }: { parts: Part[]; titre: string; centre?: string; unite?: string }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  if (total <= 0) return <p className="text-sm text-muted">Rien à répartir pour l&apos;instant.</p>;
  const tranches = tranchesCamembert(parts.map((p) => p.valeur));
  const resume = `${titre} : ${parts.map((p) => `${p.libelle} ${Math.round((p.valeur / total) * 100)} %`).join(", ")}.`;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative shrink-0">
        <svg viewBox="-80 -80 160 160" width={150} height={150} role="img" aria-label={resume}>
          {tranches.map((t, i) => (
            <path key={i} d={cheminAnneau(0, 0, 76, 26, t.debut, t.fin)} fill={couleurDe(i)} stroke="rgb(var(--surface))" strokeWidth={1.5}>
              <title>{`${parts[i].libelle} : ${parts[i].valeur}${unite} (${Math.round(t.part * 100)} %)`}</title>
            </path>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="font-display text-xl font-bold leading-none text-ink">{centre ?? total}</div>
          {centre === undefined && unite && <div className="text-[10px] text-faint">{unite}</div>}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-sm" aria-label={`Légende : ${titre}`}>
        {parts.map((p, i) => (
          <li key={p.libelle} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: couleurDe(i) }} aria-hidden />
            <span className="min-w-0 truncate text-ink">{p.libelle}</span>
            <span className="ml-auto shrink-0 tabular-nums text-muted">{p.valeur}{unite} · {Math.round((p.valeur / total) * 100)} %</span>
            {p.detail && <span className="sr-only">{p.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------- barres horizontales ---------------------------------------- */
export interface LigneBarre { libelle: string; valeur: number; texte?: string; couleur?: string; detail?: string }

export function BarresH({ lignes, titre, max }: { lignes: LigneBarre[]; titre: string; max?: number }) {
  const m = max ?? Math.max(1e-9, ...lignes.map((l) => l.valeur));
  return (
    <ul className="space-y-2" role="list" aria-label={titre}>
      {lignes.map((l, i) => (
        <li key={l.libelle}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate text-ink">{l.libelle}</span>
            <span className="shrink-0 tabular-nums text-muted">{l.texte ?? l.valeur}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${l.libelle} : ${l.texte ?? l.valeur}`}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.max(0, l.valeur) / m) * 100)}%`, backgroundColor: l.couleur ?? couleurDe(i) }} />
          </div>
          {l.detail && <div className="mt-0.5 text-[11px] text-faint">{l.detail}</div>}
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------- barres par tranche de 15 minutes --------------------------------- */
export function BarresTranches({ pour, contre, noms, titre, format = (x) => String(x), legende = ["Nous", "Adversaire"] }: {
  pour: number[]; contre: number[]; noms: string[]; titre: string; format?: (x: number) => string; legende?: [string, string];
}) {
  const W = 360, H = 150, pad = { g: 8, d: 8, h: 14, b: 22 };
  const max = maxRond([...pour, ...contre]);
  const bande = (W - pad.g - pad.d) / pour.length;
  const e = Math.min(16, bande / 2 - 3);
  const zone = H - pad.h - pad.b;
  const resume = `${titre} : ${noms.map((n, i) => `${n} minutes, ${legende[0]} ${format(pour[i])}, ${legende[1]} ${format(contre[i])}`).join(" ; ")}.`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={resume}>
        <line x1={pad.g} x2={W - pad.d} y1={H - pad.b} y2={H - pad.b} stroke="rgb(var(--line))" />
        {noms.map((nom, i) => {
          const x0 = pad.g + i * bande + bande / 2;
          return (
            <g key={nom}>
              {([[pour[i], -e - 1, "rgb(var(--chart-1))"], [contre[i], 1, "rgb(var(--chart-2))"]] as const).map(([v, dx, c], k) => {
                const h = (v / max) * zone;
                return (
                  <g key={k}>
                    <rect x={x0 + dx} y={H - pad.b - h} width={e} height={Math.max(h, v > 0 ? 2 : 0)} rx={3} fill={c} opacity={v > 0 ? 1 : 0.25}><title>{`${k === 0 ? legende[0] : legende[1]} : ${format(v)}`}</title></rect>
                    {v > 0 && <text x={x0 + dx + e / 2} y={H - pad.b - h - 3} textAnchor="middle" fontSize={9} fill="rgb(var(--ink))">{format(v)}</text>}
                  </g>
                );
              })}
              <text x={x0} y={H - 7} textAnchor="middle" fontSize={10} fill="rgb(var(--muted))">{nom}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "rgb(var(--chart-1))" }} aria-hidden />{legende[0]}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "rgb(var(--chart-2))" }} aria-hidden />{legende[1]}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------- radar --------------------------------------------- */
export function Radar({ axes, base, recent, titre, legende }: { axes: string[]; base: number[]; recent: (number | null)[]; titre: string; legende: [string, string] }) {
  const R = 78, MIN = 40, MAX = 160;
  const grille = (v: number) => versPoints(pointsRadar(axes.map(() => v), R, MIN, MAX));
  const sBase = pointsRadar(base, R, MIN, MAX), sRecent = pointsRadar(recent, R, MIN, MAX);
  const etiquettes = pointsRadar(axes.map(() => MAX), R + 16, MIN, MAX);
  const resume = `${titre} : ${axes.map((a, i) => `${a} ${recent[i] === null ? "inconnu" : recent[i]}`).join(", ")} (base 100 = ${legende[0].toLowerCase()}).`;
  return (
    <div>
      <svg viewBox="-120 -105 240 210" className="mx-auto h-auto w-full max-w-[300px]" role="img" aria-label={resume}>
        {[MIN + 20, 100, MAX].map((v) => <polygon key={v} points={grille(v)} fill="none" stroke={v === 100 ? "rgb(var(--line-strong))" : "rgb(var(--line))"} strokeDasharray={v === 100 ? undefined : "3 3"} />)}
        {sBase.map((p, i) => <line key={i} x1={0} y1={0} x2={pointsRadar(axes.map(() => MAX), R, MIN, MAX)[i].x} y2={pointsRadar(axes.map(() => MAX), R, MIN, MAX)[i].y} stroke="rgb(var(--line))" />)}
        <polygon points={versPoints(sBase)} fill="rgb(var(--chart-1) / 0.12)" stroke="rgb(var(--chart-1))" strokeWidth={1.5} />
        <polygon points={versPoints(sRecent)} fill="rgb(var(--chart-3) / 0.2)" stroke="rgb(var(--chart-3))" strokeWidth={2} />
        {sRecent.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="rgb(var(--chart-3))"><title>{`${axes[i]} : ${recent[i] ?? "inconnu"}`}</title></circle>)}
        {etiquettes.map((p, i) => <text key={i} x={p.x} y={p.y} textAnchor={Math.abs(p.x) < 4 ? "middle" : p.x > 0 ? "start" : "end"} dominantBaseline="middle" fontSize={10} fill="rgb(var(--muted))">{axes[i]}</text>)}
      </svg>
      <div className="mt-1 flex justify-center gap-4 text-[11px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "rgb(var(--chart-1))" }} aria-hidden />{legende[0]} = 100</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "rgb(var(--chart-3))" }} aria-hidden />{legende[1]}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------ courbes par match ------------------------------------------ */
export function CourbesMatchs({ noms, pour, contre, titre, legende = ["Créé", "Concédé"] }: { noms: string[]; pour: (number | null)[]; contre: (number | null)[]; titre: string; legende?: [string, string] }) {
  const W = 360, H = 140, pad = { g: 26, d: 8, h: 10, b: 20 };
  const valeurs = [...pour, ...contre].filter((v): v is number => v !== null);
  if (valeurs.length === 0) return <p className="text-sm text-muted">Aucun match saisi.</p>;
  const max = maxRond(valeurs);
  const zone = H - pad.h - pad.b, largeur = W - pad.g - pad.d;
  const x = (i: number) => pad.g + (noms.length === 1 ? largeur / 2 : (i / (noms.length - 1)) * largeur);
  const serie = (vals: (number | null)[]) => {
    const ys = echelleCourbe(vals.map((v) => v ?? 0), zone, max);
    return vals.map((v, i) => (v === null ? null : { x: x(i), y: pad.h + ys[i], v }));
  };
  const trace = (pts: ({ x: number; y: number; v: number } | null)[]) => versPoints(pts.filter((p): p is { x: number; y: number; v: number } => p !== null));
  const sp = serie(pour), sc = serie(contre);
  const pas = Math.ceil(noms.length / 8);
  const resume = `${titre} : ${noms.map((n, i) => `${n}, ${legende[0]} ${pour[i] === null ? "inconnu" : fr(pour[i]!)}, ${legende[1]} ${contre[i] === null ? "inconnu" : fr(contre[i]!)}`).join(" ; ")}.`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={resume}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}><line x1={pad.g} x2={W - pad.d} y1={pad.h + zone * (1 - t)} y2={pad.h + zone * (1 - t)} stroke="rgb(var(--line))" strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={pad.g - 4} y={pad.h + zone * (1 - t) + 3} textAnchor="end" fontSize={9} fill="rgb(var(--faint))">{fr(max * t, max < 3 ? 1 : 0)}</text></g>
        ))}
        <polyline points={trace(sc)} fill="none" stroke="rgb(var(--chart-2))" strokeWidth={2} strokeLinejoin="round" />
        <polyline points={trace(sp)} fill="none" stroke="rgb(var(--chart-1))" strokeWidth={2} strokeLinejoin="round" />
        {[sp, sc].map((s, k) => s.map((p, i) => p && <circle key={`${k}-${i}`} cx={p.x} cy={p.y} r={3} fill={k === 0 ? "rgb(var(--chart-1))" : "rgb(var(--chart-2))"} stroke="rgb(var(--surface))" strokeWidth={1.5}><title>{`${noms[i]} · ${k === 0 ? legende[0] : legende[1]} : ${fr(p.v)}`}</title></circle>))}
        {noms.map((n, i) => (i % pas === 0 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="rgb(var(--muted))">{n}</text> : null))}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "rgb(var(--chart-1))" }} aria-hidden />{legende[0]}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "rgb(var(--chart-2))" }} aria-hidden />{legende[1]}</span>
      </div>
    </div>
  );
}

/* --------------------------------------- carte de valeurs du terrain --------------------------------------- */
/** Le terrain en 3 tiers x 5 couloirs, colore selon une valeur par zone (xG, part...) ; l'attaque de mon equipe est en haut. */
export function CarteValeurs({ valeurs, nom, format = (x) => fr(x), hauteur = 170 }: { valeurs: number[]; nom: string; format?: (x: number) => string; hauteur?: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border-2" style={{ height: hauteur, borderColor: "rgb(var(--terrain-ligne))", backgroundColor: "rgb(var(--terrain))" }}
      role="img" aria-label={`${nom} : ${valeurs.map((v, i) => `${["offensif", "médian", "défensif"][Math.floor(i / 5)]} ${["gauche", "axe gauche", "centre", "axe droit", "droit"][i % 5]} ${format(v)}`).join(", ")}.`}>
      <div className="absolute inset-0 grid grid-cols-5 grid-rows-3" aria-hidden>
        {valeurs.map((v, i) => {
          const force = intensite(v, valeurs);
          return (
            <div key={i} className={`flex items-center justify-center border text-[11px] font-bold ${force > 0.5 ? "sur-accent" : "text-ink"}`}
              style={{ borderColor: "rgb(var(--terrain-ligne))", backgroundColor: v > 0 ? `rgb(var(--accent-strong) / ${0.12 + 0.78 * force})` : "transparent" }}>
              {v > 0 ? format(v) : ""}
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-[20%] top-0 h-[34%] border-[3px] border-t-0" style={{ borderColor: "rgb(var(--terrain-trace) / 0.85)" }} />
    </div>
  );
}
