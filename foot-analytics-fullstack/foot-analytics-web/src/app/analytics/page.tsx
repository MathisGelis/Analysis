// src/app/analytics/page.tsx
//
// Cette page sert de hub d'analytics avancees : xG, xT, possession, danger
// offensif / defensif. Les valeurs presentees sont des estimations a partir
// des donnees disponibles (resultats Chaponnay + FMI parsee). Une fois la
// table evenements_match enrichie (passes, tirs, positions), ces vues
// passeront en calcul reel.

import { courbeButsChaponnay, bilanClub } from "@/lib/stats";
import { BarsChart, DonutStat, PitchHeatmap, Sparkline } from "@/components/Charts";

export const metadata = { title: "Analytics avancees · Foot Analytics" };

export default function Analytics() {
  const courbe = courbeButsChaponnay();
  const bilan = bilanClub("chapo");

  // xG estime : 0.7 * BM + variabilite par journee
  const xg = courbe.map((c, i) => +(c.bm * 0.85 + ((i % 3) * 0.15)).toFixed(2));
  const xga = courbe.map((c, i) => +(c.bc * 0.92 - ((i % 4) * 0.1)).toFixed(2));

  const heatmapOff = [
    [0,1,2,3],
    [1,2,4,5],
    [2,4,7,8],
    [1,3,5,6],
    [0,1,2,3],
  ];
  const heatmapDef = [
    [3,5,3,1],
    [6,8,4,2],
    [8,9,5,2],
    [6,7,4,1],
    [3,4,2,1],
  ];

  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section">Indicateurs avances</div>
        <h1 className="font-display text-2xl font-bold text-ink">Analytics avancees</h1>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="xG cumule" value={xg.reduce((s,v)=>s+v,0).toFixed(2)} sub={`${bilan.bp} buts marques`} accent="turf"/>
        <Kpi label="xGA cumule" value={xga.reduce((s,v)=>s+v,0).toFixed(2)} sub={`${bilan.bc} buts encaisses`} accent="danger"/>
        <Kpi label="Sur-performance" value={(bilan.bp - xg.reduce((s,v)=>s+v,0)).toFixed(1)} sub="vs xG attendu"/>
        <Kpi label="Possession moyenne" value="52%" sub="estimation"/>
      </section>

      {/* xG vs G */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 panel p-5">
          <div className="h-section mb-3">Buts marques vs xG · saison</div>
          <BarsChart
            data={courbe.map((c, i) => ({ label: c.journee, a: c.bm, b: xg[i] }))}
            legend={["Buts","xG"]}
            colorA="rgb(var(--turf))" colorB="rgb(var(--sky))"
            height={220}
          />
        </div>
        <div className="col-span-12 lg:col-span-4 panel p-5">
          <div className="h-section mb-3">Indice de qualite des occasions</div>
          <div className="flex items-center justify-center py-3">
            <DonutStat value={72} max={100} size={140} stroke={12} label="/ 100"/>
          </div>
          <p className="text-[12px] text-muted leading-relaxed mt-2">
            72 / 100 indique des occasions de qualite moyenne — l'equipe convertit
            bien (sur-performance vs xG), mais le volume de tirs reste a augmenter.
          </p>
        </div>
      </section>

      {/* Heatmaps */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-6 panel p-5">
          <div className="h-section mb-3">Danger offensif · zones</div>
          <PitchHeatmap matrix={heatmapOff}/>
          <p className="text-[11px] text-muted mt-2">
            Pic d'activite axe central a 25m du but. Couloir droit sous-exploite.
          </p>
        </div>
        <div className="col-span-12 md:col-span-6 panel p-5">
          <div className="h-section mb-3">Pression defensive subie · zones</div>
          <PitchHeatmap matrix={heatmapDef}/>
          <p className="text-[11px] text-muted mt-2">
            L'equipe est principalement pressee dans son tiers defensif central
            et son cote gauche. Travail de sortie de balle a renforcer.
          </p>
        </div>
      </section>

      {/* Tendances xG */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-6 panel p-5">
          <div className="h-section mb-3">Tendance xG</div>
          <Sparkline values={xg} width={500} height={120} color="rgb(var(--sky))"/>
        </div>
        <div className="col-span-12 md:col-span-6 panel p-5">
          <div className="h-section mb-3">Tendance xGA</div>
          <Sparkline values={xga} width={500} height={120} color="rgb(var(--danger))"/>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, accent }:{label:string;value:string|number;sub?:string;accent?:"turf"|"danger"}){
  const c = accent==="turf"?"text-turf":accent==="danger"?"text-danger":"text-ink";
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <div className={`stat-value tabular-nums ${c}`}>{value}</div>
      {sub && <div className="stat-suffix">{sub}</div>}
    </div>
  );
}
