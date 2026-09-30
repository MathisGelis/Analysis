// src/app/rapports/equipe/[clubId]/page.tsx
//
// Rapport d'analyse d'equipe genere depuis le backend
// (/api/analyse/club/:clubId?equipeId=&saisonId=), restreint a l'equipe du club
// consultee sur la saison choisie dans le selecteur.
// Affiche : scores danger / chaos / forme, joueurs cles, impact de chaque
// joueur, stabilite par ligne, faiblesses identifiees, compo probable,
// partnerships gagnants, minute moyenne des changements.

import { notFound } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getOwnSaisonIdServer } from "@/lib/own-equipe";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { equipeConsultee } from "@/lib/equipe-consultee";
import { ClubBadge } from "@/components/ClubBadge";
import { DonutStat } from "@/components/Charts";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Award, BarChart3, Clock,
  Flame, Info, RotateCcw, Shield, TrendingDown, TrendingUp, Users, Zap,
} from "lucide-react";

export const metadata = { title: "Rapport equipe · Foot Analytics" };

const LIGNE_LABEL: Record<string, string> = {
  GB: "Gardiens", DEF: "Defense", MIL: "Milieu", ATT: "Attaque",
};

export default async function RapportEquipe({
  params,
}: { params: { clubId: string } }) {
  // Saison et equipe : sans elles le rapport melangerait Seniors, U20 et toutes
  // les saisons. La saison suit le selecteur, l'equipe le championnat de mon equipe.
  const [saisons, equipes, matchs] = await Promise.all([api.saisons(), api.equipes(), api.matchs()]);
  const saison = saisons.find((s: any) => s.id === getOwnSaisonIdServer())
    ?? saisons.find((s: any) => s.actif) ?? null;
  const { equipe: maEquipe } = await resolveEquipePropre({ equipes, saisons, matchs });
  const equipe = equipeConsultee({ equipes, clubId: params.clubId, saisonId: saison?.id ?? null, maEquipe });
  const rapport = await api.analyseClub(params.clubId, { equipeId: equipe?.id, saisonId: saison?.id });
  if (!rapport) notFound();

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-center justify-between">
        <Link href="/rapports" className="text-xs text-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft size={12}/> Retour rapports
        </Link>
        <span className="badge">{rapport.matchsAnalyses} matchs analyses</span>
      </div>

      <header className="panel p-6 grid grid-cols-12 gap-5">
        <div className="col-span-12 md:col-span-6 flex items-center gap-4">
          <ClubBadge clubId={rapport.clubId} size={56}/>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-faint">Rapport d'equipe</div>
            <h1 className="font-display text-3xl font-bold text-ink leading-tight">
              {rapport.clubNom}
            </h1>
            <p className="text-xs text-muted mt-1">
              {equipe && <>{equipe.categorie} {equipe.division}{equipe.poule ? ` · Poule ${equipe.poule}` : ""} · </>}
              {saison ? <>saison {saison.nom}</> : "toutes saisons"} · genere a partir des
              feuilles FMI et donnees d'entrainement.
            </p>
          </div>
        </div>
        <div className="col-span-12 md:col-span-6 grid grid-cols-3 gap-3">
          <ScoreCard label="Score danger" value={rapport.scoreDanger}
            icon={<Flame size={14}/>} color="rgb(var(--danger))" />
          <ScoreCard label="Score chaos" value={rapport.scoreChaos}
            icon={<RotateCcw size={14}/>} color="rgb(var(--amber))" />
          <ScoreCard label="Forme moyenne" value={rapport.formeMoy}
            icon={<TrendingUp size={14}/>} color="rgb(var(--accent))" />
        </div>
      </header>

      {rapport.matchsAnalyses === 0 && (
        <section className="panel p-8 text-center space-y-2">
          <div className="font-display text-lg font-bold text-ink">Pas encore de match analyse</div>
          <p className="text-sm text-muted max-w-xl mx-auto">
            Aucune feuille de match n'a ete importee pour {rapport.clubNom}
            {saison ? <> sur la saison <strong className="text-ink">{saison.nom}</strong></> : null}.
            Le rapport se construit tout seul des les premieres feuilles FMI.
          </p>
          <Link href="/import" className="btn btn-primary inline-flex">Importer une FMI</Link>
        </section>
      )}

      {rapport.matchsAnalyses > 0 && <>
      {/* Faiblesses */}
      {rapport.faiblesses.length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <AlertTriangle size={11} className="text-danger"/>
            Faiblesses identifiees ({rapport.faiblesses.length})
          </div>
          <ul className="space-y-2">
            {rapport.faiblesses.map((f: any, i: number) => (
              <li key={i} className={`panel-inset p-3 border-l-2 flex items-start gap-3 ${
                f.niveau === "critique" ? "border-danger"
                : f.niveau === "alerte" ? "border-amber"
                : "border-line"
              }`}>
                <div className="mt-0.5">
                  {f.niveau === "critique" ? <AlertTriangle size={14} className="text-danger"/>
                   : f.niveau === "alerte" ? <AlertTriangle size={14} className="text-amber"/>
                   : <Info size={14} className="text-faint"/>}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-ink">{f.titre}</div>
                  <div className="text-xs text-muted mt-0.5">{f.detail}</div>
                </div>
                <span className={`badge text-[9px] !px-1.5 ${
                  f.niveau === "critique" ? "badge-danger"
                  : f.niveau === "alerte" ? "badge-amber" : ""
                }`}>{f.niveau}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-12 gap-4">
        {/* Joueurs cles */}
        <div className="col-span-12 lg:col-span-7 panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <Award size={11} className="text-accent"/>
            Joueurs cles
            <span className="text-[10px] text-faint normal-case font-normal tracking-normal ml-1">
              (titulaires reguliers a fort impact positif)
            </span>
          </div>
          {rapport.joueursCles.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">
              Pas assez de donnees pour identifier des joueurs cles
              (au moins la moitie des matchs joues avec un impact positif).
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rapport.joueursCles.map((j: any) => (
                <div key={j.joueurId} className="panel-inset p-3 flex items-center gap-3 border-l-2 border-accent">
                  <div className="w-10 h-10 rounded-md bg-panel grid place-items-center font-display font-bold text-accent">
                    {j.matchsAvec}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/joueur/${j.joueurId}`} className="font-display font-bold text-ink hover:text-accent truncate block">
                      {j.prenom} {j.nom}
                    </Link>
                    <div className="text-[11px] text-muted">{j.poste} · {j.titularisations} titu sur {rapport.matchsAnalyses}</div>
                    <div className="text-[11px] text-accent mt-0.5">
                      +{j.delta.toFixed(2)} pts/match · impact {j.impactPondere > 0 ? "+" : ""}{j.impactPondere}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stabilite par ligne */}
        <div className="col-span-12 lg:col-span-5 panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <Shield size={11} className="text-accent"/>
            Stabilite ({rapport.stabilite.global} / 100)
          </div>
          <ul className="space-y-2">
            {rapport.stabilite.parLigne.map((s: any) => (
              <li key={s.ligne} className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-wider text-faint w-20">
                  {LIGNE_LABEL[s.ligne]}
                </span>
                <div className="flex-1 bg-line h-1.5 rounded-full overflow-hidden">
                  <div className={`h-full ${
                    s.stabilite >= 70 ? "bg-accent"
                    : s.stabilite >= 40 ? "bg-amber" : "bg-danger"
                  }`} style={{width:`${s.stabilite}%`}}/>
                </div>
                <span className="text-xs tabular-nums w-8 text-right">{s.stabilite}</span>
                <span className="text-[10px] text-faint w-20 text-right">
                  {s.effectifUtilise} joueurs · {s.rotations} rotations
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Maillons faibles — joueurs reguliers a impact negatif */}
      {rapport.impactsFaibles && rapport.impactsFaibles.length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <TrendingDown size={11} className="text-danger"/>
            Maillons faibles
            <span className="text-[10px] text-faint normal-case font-normal tracking-normal ml-1">
              (titulaires reguliers dont la presence coute des points a l'equipe)
            </span>
          </div>
          <p className="text-[11px] text-faint mb-3">
            Ces joueurs ont joue au moins la moitie des matchs, mais l'equipe
            obtient en moyenne MOINS de points quand ils sont sur le terrain.
            A traiter en priorite (forme, role tactique, role mental).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rapport.impactsFaibles.map((j: any) => (
              <div key={j.joueurId} className="panel-inset p-3 flex items-center gap-3 border-l-2 border-danger">
                <div className="w-10 h-10 rounded-md bg-panel grid place-items-center font-display font-bold text-danger">
                  {j.matchsAvec}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/joueur/${j.joueurId}`} className="font-display font-bold text-ink hover:text-accent truncate block">
                    {j.prenom} {j.nom}
                  </Link>
                  <div className="text-[11px] text-muted">
                    {j.poste} · {j.titularisations} titu sur {rapport.matchsAnalyses}
                  </div>
                  <div className="text-[11px] text-danger mt-0.5">
                    {j.delta.toFixed(2)} pts/match · impact {j.impactPondere}
                  </div>
                  <div className="text-[10px] text-faint">
                    Avec : {j.pointsParMatchAvec.toFixed(2)} ppm · Sans : {j.pointsParMatchSans.toFixed(2)} ppm
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-12 gap-4">
        {/* Compo probable */}
        <div className="col-span-12 lg:col-span-7 panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <Users size={11} className="text-accent"/>
            Compo probable ({rapport.compoProbable.length}/11)
          </div>
          {rapport.compoProbable.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">
              Aucun joueur recurrent — trop peu de matchs pour deduire une compo.
            </p>
          ) : (
            <table className="table-fm">
              <thead>
                <tr>
                  <th>#</th><th>Joueur</th><th>Poste</th><th className="text-right">Titularisations</th>
                </tr>
              </thead>
              <tbody>
                {[...rapport.compoProbable]
                  .sort((a: any, b: any) => (a.numero ?? 99) - (b.numero ?? 99))
                  .map((c: any, i: number) => (
                  <tr key={i}>
                    <td className="font-mono text-muted">{c.numero ?? "—"}</td>
                    <td className="font-semibold">{c.nom}</td>
                    <td><span className="badge">{c.poste}</span></td>
                    <td className="text-right tabular-nums">
                      {c.matchsJoues}
                      <span className="text-faint text-[10px]">
                        /{rapport.matchsAnalyses}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Minute moyenne changements */}
        <div className="col-span-12 lg:col-span-5 panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <Clock size={11} className="text-accent"/>
            Timing des changements
          </div>
          {rapport.changementsMoy.moyenne === 0 ? (
            <p className="text-sm text-muted py-4 text-center">
              Aucun changement enregistre.
            </p>
          ) : (
            <>
              <div className="grid place-items-center mb-4">
                <DonutStat value={rapport.changementsMoy.moyenne} size={120} stroke={10}
                  color="rgb(var(--amber))" label="min moy." max={90}/>
              </div>
              <ul className="space-y-1.5 text-sm">
                {rapport.changementsMoy.parTypeMatch.map((t: any) => (
                  <li key={t.type} className="flex items-center justify-between text-xs">
                    <span className="text-muted capitalize">{t.type}</span>
                    <span className="tabular-nums">
                      {t.nbChangements > 0 ? `${t.moyenne}'` : "—"}
                      <span className="text-faint ml-1">({t.nbChangements})</span>
                    </span>
                  </li>
                ))}
              </ul>
              {rapport.changementsMoy.nbChangementsAvant60 > 0 && (
                <p className="text-[11px] text-amber mt-3 italic">
                  {rapport.changementsMoy.nbChangementsAvant60} changement(s)
                  effectue(s) avant la 60e minute — peut indiquer un onze
                  initial mal calibre.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Changements de coach detectes — alerte visible en haut */}
      {rapport.changementsCoach && rapport.changementsCoach.length > 0 && (
        <section className="panel p-5 border-l-2 border-amber">
          <div className="h-section mb-3 flex items-center gap-2">
            <AlertTriangle size={11} className="text-amber"/>
            Changement{rapport.changementsCoach.length > 1 ? "s" : ""} d'entraineur detecte{rapport.changementsCoach.length > 1 ? "s" : ""}
            <span className="badge badge-amber text-[9px] !px-1.5 !py-0">
              {rapport.changementsCoach.length}
            </span>
          </div>
          <ul className="space-y-2">
            {rapport.changementsCoach.map((c: any, i: number) => (
              <li key={i} className="panel-inset p-3 flex items-center gap-3 text-sm">
                <span className="text-faint text-xs tabular-nums w-24">
                  {c.date}{c.journee ? ` · J${c.journee}` : ""}
                </span>
                <span className="text-muted">{c.avant}</span>
                <ArrowRight size={12} className="text-amber"/>
                <span className="text-ink font-semibold">{c.apres}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-faint mt-3 italic">
            Detecte automatiquement depuis l'enchainement des feuilles FMI :
            un changement d'entraineur (fonction E) entre deux journees
            successives indique une bascule de staff.
          </p>
        </section>
      )}

      {/* Tableau des coachs */}
      {rapport.coachs && rapport.coachs.length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <Users size={11} className="text-accent"/>
            Staff identifie ({rapport.coachs.length})
          </div>
          <p className="text-[11px] text-faint mb-3">
            Liste des entraineurs, adjoints, medecins et dirigeants ayant
            accompagne l'equipe sur les FMI analysees. Les delegues de
            rencontre (DR) sont exclus des cumuls. Le taux de reussite est
            calcule uniquement sur les matchs ou le staff etait present.
          </p>
          <table className="table-fm">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Fonction</th>
                <th className="text-center">Matchs</th>
                <th className="text-center">V-N-D</th>
                <th className="text-right">% V</th>
                <th className="text-center">CJ</th>
                <th className="text-center">CR</th>
                <th>Periode</th>
              </tr>
            </thead>
            <tbody>
              {rapport.coachs.map((c: any) => (
                <tr key={c.coachId}>
                  <td className="font-semibold">
                    <span className="text-faint">{c.prenom} </span>{c.nom}
                  </td>
                  <td>
                    {c.fonctionPrincipale ? (
                      <span className={`badge text-[10px] ${
                        c.fonctionPrincipale === "Entraineur" ? "badge-accent"
                        : c.fonctionPrincipale === "Adjoint" ? "badge-sky"
                        : c.fonctionPrincipale === "Medecin" ? "badge-amber"
                        : ""
                      }`}>{c.fonctionPrincipale}</span>
                    ) : <span className="text-faint">—</span>}
                    <span className="text-[10px] text-faint ml-2">{c.fonctions}</span>
                  </td>
                  <td className="text-center tabular-nums">{c.matchsPresent}</td>
                  <td className="text-center text-[11px] tabular-nums">
                    <span className="text-win">{c.v}</span>-
                    <span className="text-draw">{c.n}</span>-
                    <span className="text-loss">{c.d}</span>
                  </td>
                  <td className={`text-right font-display font-bold tabular-nums ${
                    c.txReussite >= 60 ? "text-accent"
                    : c.txReussite >= 30 ? "text-amber" : "text-danger"
                  }`}>{c.txReussite}%</td>
                  <td className="text-center text-amber font-mono">{c.cartonsJaunes || ""}</td>
                  <td className="text-center text-danger font-mono">{c.cartonsRouges || ""}</td>
                  <td className="text-[10px] text-faint">
                    {c.premierMatch && c.dernierMatch ? (
                      c.premierMatch === c.dernierMatch ? c.premierMatch
                      : `${c.premierMatch} → ${c.dernierMatch}`
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Partnerships */}
      {rapport.partnerships.length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <BarChart3 size={11} className="text-accent"/>
            Combinaisons de joueurs gagnantes
          </div>
          <p className="text-[11px] text-faint mb-3">
            Trios de defense, milieu et duos d'attaque alignes plusieurs
            fois ensemble, avec leur taux de victoire.
          </p>
          <table className="table-fm">
            <thead>
              <tr>
                <th>Ligne</th><th>Joueurs</th>
                <th className="text-center">Matchs</th>
                <th className="text-center">V-N-D</th>
                <th className="text-center">BP/BC</th>
                <th className="text-right">% V</th>
              </tr>
            </thead>
            <tbody>
              {rapport.partnerships.map((p: any, i: number) => (
                <tr key={i}>
                  <td>
                    <span className={`badge text-[10px] ${
                      p.type === "attaque" ? "badge-danger"
                      : p.type === "defense" ? "badge-accent"
                      : "badge-amber"
                    }`}>{p.type}</span>
                  </td>
                  <td className="text-xs font-semibold">{p.joueurs.join(" + ")}</td>
                  <td className="text-center tabular-nums">{p.matchsEnsemble}</td>
                  <td className="text-center text-[11px] tabular-nums">
                    <span className="text-win">{p.v}</span>-
                    <span className="text-draw">{p.n}</span>-
                    <span className="text-loss">{p.d}</span>
                  </td>
                  <td className="text-center font-mono text-xs">{p.bp}-{p.bc}</td>
                  <td className={`text-right font-display font-bold tabular-nums ${
                    p.txReussite >= 60 ? "text-accent"
                    : p.txReussite >= 30 ? "text-amber" : "text-danger"
                  }`}>{p.txReussite}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Tableau impact tous joueurs */}
      <section className="panel p-5">
        <div className="h-section mb-3 flex items-center gap-2">
          <Zap size={11} className="text-accent"/>
          Impact de chaque joueur sur les resultats
        </div>
        <p className="text-[11px] text-faint mb-3">
          Comparaison des points par match selon la presence (titulaire ou
          remplacant rentre en jeu) ou l'absence du joueur. L'<strong>impact
          pondere</strong> tient compte du nombre de matchs joues : un joueur
          n'ayant joue qu'un match victorieux ne ressort pas artificiellement
          au top. La liste est triee par cet indicateur.
        </p>
        <table className="table-fm">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Poste</th>
              <th className="text-center">Matchs avec</th>
              <th className="text-center">Sans</th>
              <th className="text-right">PPM avec</th>
              <th className="text-right">PPM sans</th>
              <th className="text-right">Delta</th>
              <th className="text-right">Impact pondere</th>
            </tr>
          </thead>
          <tbody>
            {rapport.impacts.slice(0, 20).map((i: any) => (
              <tr key={i.joueurId}>
                <td>
                  <Link href={`/joueur/${i.joueurId}`} className="font-semibold hover:text-accent">
                    <span className="text-faint">{i.prenom}</span> {i.nom}
                  </Link>
                </td>
                <td><span className="badge text-[10px]">{i.poste ?? "—"}</span></td>
                <td className="text-center tabular-nums">{i.matchsAvec}</td>
                <td className="text-center tabular-nums text-faint">{i.matchsSans}</td>
                <td className="text-right tabular-nums">{i.pointsParMatchAvec.toFixed(2)}</td>
                <td className="text-right tabular-nums text-faint">{i.pointsParMatchSans.toFixed(2)}</td>
                <td className={`text-right tabular-nums font-display font-bold ${
                  i.delta > 0.5 ? "text-accent"
                  : i.delta < -0.5 ? "text-danger" : ""
                }`}>
                  {i.delta > 0 && <ArrowRight size={10} className="inline rotate-[-45deg] text-accent mr-0.5"/>}
                  {i.delta < 0 && <ArrowRight size={10} className="inline rotate-[45deg] text-danger mr-0.5"/>}
                  {i.delta >= 0 ? "+" : ""}{i.delta.toFixed(2)}
                </td>
                <td className={`text-right tabular-nums font-display font-bold ${
                  i.impactPondere > 0.5 ? "text-accent"
                  : i.impactPondere < -0.5 ? "text-danger" : "text-faint"
                }`}>
                  {i.impactPondere >= 0 ? "+" : ""}{i.impactPondere.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rapport.impacts.length > 20 && (
          <p className="text-[11px] text-faint mt-3 text-center">
            Affichage des 20 premiers — {rapport.impacts.length} joueurs analyses au total.
          </p>
        )}
      </section>
      </>}
    </div>
  );
}

function ScoreCard({
  label, value, icon, color,
}: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="stat-tile flex flex-col items-center justify-center gap-2">
      <div className="stat-label flex items-center gap-1">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <DonutStat value={value} size={88} stroke={9} color={color} label="/ 100"/>
    </div>
  );
}
