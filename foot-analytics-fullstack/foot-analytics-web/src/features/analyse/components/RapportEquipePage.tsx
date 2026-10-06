// src/features/analyse/components/RapportEquipePage.tsx
//
// Rapport d'analyse d'equipe genere depuis le backend
// (/api/analyse/club/:clubId?equipeId=&saisonId=), restreint a l'equipe du club
// consultee sur la saison choisie dans le selecteur.
//
// Lecture en trois temps : ce qu'il faut retenir (constats ecrits par le moteur de
// tendances), les courbes de dynamique (forme, attaque, defense, lieux, adversaires,
// discipline), puis le detail de l'effectif (joueurs cles, rotation, compo, staff, impact).

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Award, BarChart3, Clock, Crosshair, Flame, Info,
  MapPin, RotateCcw, Sparkles, TrendingDown, TrendingUp, Users, Zap,
} from "lucide-react";

import { api } from "@/shared/lib/api";
import { getOwnSaisonIdServer } from "@/features/equipes/lib/own-equipe";
import { resolveEquipePropre } from "@/features/equipes/lib/resolve-equipe-propre";
import { equipeConsultee } from "@/features/equipes/lib/equipe-consultee";
import type { PerimetreRapport, StabiliteRapport, Tendances } from "@/features/analyse/lib/analyse-types";
import { LIBELLE_SENS, libelleSerie, serieFavorable } from "@/features/analyse/lib/tendances-format";
import { COULEUR_NIVEAU, LIBELLE_NIVEAU, niveauFatigue } from "@/features/joueurs/lib/fatigue";
import { ClubBadge } from "@/features/clubs/components/ClubBadge";
import { DonutStat } from "@/shared/ui/Charts";
import { OngletsDossier } from "@/features/rapports/components/OngletsDossier";
import { verdictPage } from "@/features/shell/lib/garde-page";

import { CourbeGlissante } from "./CourbeGlissante";
import { InsightsGrid } from "./InsightsGrid";
import { ComparatifForme } from "./ComparatifForme";
import { ProfilCard } from "./ProfilCard";
import { LieuxCard } from "./LieuxCard";
import { NiveauCard } from "./NiveauCard";
import { MomentsButs } from "./MomentsButs";
import { DisciplineCard } from "./DisciplineCard";
import { RotationCard } from "./RotationCard";
import { PastilleSens } from "./PastilleSens";

export default async function RapportEquipe({
  params,
}: { params: Promise<{ clubId: string }> }) {
  const { clubId: idClub } = await params;
  const idSaisonChoisie = await getOwnSaisonIdServer();
  // Saison et equipe : sans elles le rapport melangerait Seniors, U20 et toutes
  // les saisons. La saison suit le selecteur, l'equipe le championnat de mon equipe.
  const [saisons, equipes, matchs, clubs] = await Promise.all([api.saisons(), api.equipes(), api.matchs(), api.clubs()]);
  const saison = saisons.find((s: any) => s.id === idSaisonChoisie)
    ?? saisons.find((s: any) => s.actif) ?? null;
  const { equipe: maEquipe } = await resolveEquipePropre({ equipes, saisons, matchs });
  const equipe = equipeConsultee({ equipes, clubId: idClub, saisonId: saison?.id ?? null, maEquipe });
  const [rapport, prematch] = await Promise.all([
    api.analyseClub(idClub, { equipeId: equipe?.id, saisonId: saison?.id }),
    verdictPage("/rapports/prematch"),
  ]);
  if (!rapport) notFound();

  const t: Tendances = rapport.tendances;
  const perimetre: PerimetreRapport = rapport.perimetre;
  const stabilite: StabiliteRapport = rapport.stabilite;
  const noms: Record<string, string> = Object.fromEntries(clubs.map((c) => [c.id, c.nom]));
  const jugeable = t.forme.sens !== "insuffisant";
  const niveauFatigueEquipe = niveauFatigue(rapport.fatigueMoy);
  const courbeOk = jugeable && t.courbe.length >= 3;
  const yButs = Math.max(2, Math.ceil(Math.max(...t.courbe.flatMap((p) => [p.bpGlissant, p.bcGlissant]), 0) / 2) * 2);
  const recordsNotables = t.series.records.filter((r) => r.longueur >= 3);

  const ancres = [
    t.insights.length > 0 && ["constats", "Constats"],
    courbeOk && ["forme", "Dynamique"],
    courbeOk && ["buts", "Attaque et defense"],
    ["contexte", "Contexte"],
    ["discipline", "Discipline"],
    rapport.faiblesses.length > 0 && ["points", "Points d'attention"],
    ["effectif", "Effectif"],
    rapport.coachs?.length > 0 && ["staff", "Staff"],
    ["joueurs", "Impact joueurs"],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="space-y-6 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/rapports" className="text-xs text-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft size={12}/> Retour rapports
        </Link>
        <OngletsDossier clubId={idClub} courant="equipe" monClub={maEquipe?.clubId === idClub} prematchOuvert={prematch.restriction === null} />
        <span className="badge">{rapport.matchsAnalyses} matchs analyses</span>
      </div>

      <header className="panel p-6 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-5 flex items-center gap-4">
          <ClubBadge clubId={rapport.clubId} size={56}/>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-faint">Rapport d'equipe</div>
            <h1 className="font-display text-3xl font-bold text-ink leading-tight">
              {rapport.clubNom}
            </h1>
            <p className="text-xs text-muted mt-1">
              {perimetre.equipeNom
                ? <>{perimetre.equipeNom}{perimetre.competition ? ` · ${perimetre.competition}` : ""} · </>
                : equipe && <>{equipe.categorie} {equipe.division}{equipe.poule ? ` · Poule ${equipe.poule}` : ""} · </>}
              {perimetre.saisonNom ? <>saison {perimetre.saisonNom}{perimetre.saisonActive ? "" : " (terminee)"}</> : "toutes saisons"}
            </p>
            {jugeable && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <PastilleSens sens={t.forme.sens} libelle={`Points : ${LIBELLE_SENS[t.forme.sens].toLowerCase()}`} />
                {t.series.enCours.slice(0, 1).map((s) => (
                  <span key={s.type} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    serieFavorable(s.type) ? "border-win/35 bg-win/10 text-win" : "border-loss/35 bg-loss/10 text-loss"
                  }`}>{libelleSerie(s.type, s.longueur)}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ScoreCard label="Danger" note="menace de l'equipe" value={rapport.scoreDanger}
            icon={<Flame size={14}/>} color="rgb(var(--danger))" />
          <ScoreCard label="Chaos" note="instabilite du onze" value={rapport.scoreChaos}
            icon={<RotateCcw size={14}/>} color="rgb(var(--amber))" />
          <ScoreCard label="Fatigue" note={niveauFatigueEquipe ? `${LIBELLE_NIVEAU[niveauFatigueEquipe]} · titulaires` : "titulaires types"} value={rapport.fatigueMoy}
            absent="Mesure du moment : disponible sur la saison en cours, avec des seances ou des matchs recents."
            icon={<Activity size={14}/>} color={niveauFatigueEquipe ? COULEUR_NIVEAU[niveauFatigueEquipe] : "rgb(var(--accent))"} />
          <ScoreCard label="Dynamique" note={jugeable ? t.forme.libelle : "trop tot"} value={t.forme.score}
            absent="Il faut au moins 6 matchs pour juger une dynamique."
            icon={<Zap size={14}/>} color="rgb(var(--chart-3))" />
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
      <nav aria-label="Sections du rapport" className="-mt-2 flex gap-2 overflow-x-auto pb-1">
        {ancres.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="badge shrink-0 hover:border-accent/40 hover:text-accent">{label}</a>
        ))}
      </nav>

      {!jugeable && (
        <section className="panel flex items-start gap-3 p-5">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <div>
            <div className="text-sm font-semibold text-ink">Pas encore assez de matchs pour degager des tendances</div>
            <p className="mt-0.5 text-xs text-muted">
              {t.matchs} match{t.matchs > 1 ? "s" : ""} analyse{t.matchs > 1 ? "s" : ""} : il en faut au moins 6 pour comparer la forme recente au reste de la saison.
              Les mesures ci-dessous restent valables, mais sans courbe ni verdict de dynamique.
            </p>
          </div>
        </section>
      )}

      {/* Ce qu'il faut retenir */}
      {t.insights.length > 0 && (
        <Section id="constats" titre="Ce qu'il faut retenir" icone={<Sparkles size={11} className="text-accent"/>}
          aide="constats detectes automatiquement sur les resultats de la saison">
          <InsightsGrid insights={t.insights} />
        </Section>
      )}

      {/* Dynamique : points par match, glissant */}
      {courbeOk && (
        <Section id="forme" titre="Dynamique" icone={<TrendingUp size={11} className="text-accent"/>}
          aide={`points par match, moyenne glissante sur ${t.forme.fenetre} matchs`}>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <CourbeGlissante points={t.courbe} noms={noms} unite="points par match" yMax={3}
                series={[{ label: "Points / match", valeurs: t.courbe.map((p) => p.ppmGlissant), variable: "--chart-1" }]}
                reference={{ label: "Moyenne saison", valeur: t.forme.saison.ppm }} />
            </div>
            <div className="space-y-5 xl:col-span-5">
              <ComparatifForme forme={t.forme} />
              {t.series.enCours.length > 0 && (
                <div>
                  <div className="h-section mb-2">Series en cours</div>
                  <div className="flex flex-wrap gap-2">
                    {t.series.enCours.map((s) => (
                      <span key={s.type} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        serieFavorable(s.type) ? "border-win/35 bg-win/10 text-win" : "border-loss/35 bg-loss/10 text-loss"
                      }`}>{libelleSerie(s.type, s.longueur)}</span>
                    ))}
                  </div>
                </div>
              )}
              {recordsNotables.length > 0 && (
                <p className="text-[11px] leading-relaxed text-faint">
                  Records de la saison : {recordsNotables.map((r) => libelleSerie(r.type, r.longueur)).join(" · ")}.
                </p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Attaque et defense */}
      {courbeOk && (
        <Section id="buts" titre="Attaque et defense" icone={<Crosshair size={11} className="text-accent"/>}
          aide={`buts par match, moyenne glissante sur ${t.forme.fenetre} matchs`}>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <CourbeGlissante points={t.courbe} noms={noms} unite="buts par match" yMax={yButs}
                series={[
                  { label: "Marques", valeurs: t.courbe.map((p) => p.bpGlissant), variable: "--chart-1" },
                  { label: "Encaisses", valeurs: t.courbe.map((p) => p.bcGlissant), variable: "--chart-2" },
                ]} />
            </div>
            <div className="xl:col-span-5">
              <ProfilCard profil={t.profil} moities={t.moities} />
            </div>
          </div>
        </Section>
      )}

      {/* Contexte : lieu et niveau des adversaires */}
      <section id="contexte" className="grid scroll-mt-24 grid-cols-12 gap-4">
        <div className={`panel col-span-12 p-5 ${t.parNiveau ? "lg:col-span-6" : ""}`}>
          <div className="h-section mb-4 flex items-center gap-2"><MapPin size={11} className="text-accent"/>Domicile et exterieur</div>
          <LieuxCard lieux={t.lieux} />
        </div>
        {t.parNiveau && (
          <div className="panel col-span-12 p-5 lg:col-span-6">
            <div className="h-section mb-4 flex items-center gap-2"><BarChart3 size={11} className="text-accent"/>Selon le niveau de l'adversaire</div>
            <NiveauCard niveaux={t.parNiveau} />
          </div>
        )}
      </section>

      {/* Moments du match et discipline : le graphique des buts n'a de sens que si les feuilles donnent la minute */}
      <section id="discipline" className="grid scroll-mt-24 grid-cols-12 gap-4">
        {t.butsParTranche.disponible && (
          <div className="panel col-span-12 p-5 lg:col-span-6">
            <div className="h-section mb-4 flex items-center gap-2"><Clock size={11} className="text-accent"/>Buts par tranche de 15 minutes</div>
            <MomentsButs buts={t.butsParTranche} />
          </div>
        )}
        <div className={`panel col-span-12 p-5 ${t.butsParTranche.disponible ? "lg:col-span-6" : ""}`}>
          <div className="h-section mb-4 flex items-center gap-2"><AlertTriangle size={11} className="text-amber"/>Discipline</div>
          <DisciplineCard discipline={t.discipline} matchs={t.matchs} large={!t.butsParTranche.disponible} />
          {!t.butsParTranche.disponible && (
            <p className="mt-4 border-t border-line pt-3 text-[11px] text-faint">
              Buts par tranche de 15 minutes : indisponible, {t.butsParTranche.couverture > 0
                ? <>les feuilles de match ne donnent la minute que de {Math.round(t.butsParTranche.couverture * 100)} % des buts.</>
                : <>les feuilles de match ne donnent pas la minute des buts.</>}{" "}
              Le graphique apparaitra des que les buteurs seront renseignes.
            </p>
          )}
        </div>
      </section>

      {/* Faiblesses */}
      {rapport.faiblesses.length > 0 && (
        <section id="points" className="panel scroll-mt-24 p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <AlertTriangle size={11} className="text-danger"/>
            Points d'attention ({rapport.faiblesses.length})
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

      <section id="effectif" className="grid scroll-mt-24 grid-cols-12 gap-4">
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

        {/* Rotation et stabilite par ligne */}
        <div className="col-span-12 lg:col-span-5 panel p-5">
          <div className="h-section mb-4 flex items-center gap-2">
            <RotateCcw size={11} className="text-accent"/>
            Rotation du onze
          </div>
          <RotationCard rotation={t.rotation} stabilite={stabilite} />
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
          {rapport.compoProbableSource === "modele" ? (
            <p className="-mt-1.5 mb-3 text-[11px] text-faint">
              Predite par le modele de l'IA ({rapport.compoProbableModele ?? "modele actif"}), d'apres les {rapport.compoProbableSur} dernieres feuilles :
              la colonne Chance est sa probabilite que le joueur commence le prochain match.
            </p>
          ) : rapport.numeros?.fiabilite?.exploitable && (
            <p className="-mt-1.5 mb-3 text-[11px] text-faint">
              Un joueur par numero de maillot (1 gardien, 2 DD, 3 DG, 4 DCD, 5 DCG, 6 MDC, 7 AG, 8 MC, 9 BU, 10 MO, 11 AD), sur les {rapport.numeros.matchs} dernieres feuilles.
            </p>
          )}
          {rapport.compoProbable.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">
              Aucun joueur recurrent — trop peu de matchs pour deduire une compo.
            </p>
          ) : (
            <table className="table-fm">
              <thead>
                <tr>
                  <th>#</th><th>Joueur</th><th>Poste</th>
                  {rapport.compoProbableSource === "modele" && <th className="text-right">Chance</th>}
                  <th className="text-right">Titularisations</th>
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
                    {rapport.compoProbableSource === "modele" && <td className="text-right font-semibold tabular-nums">{typeof c.proba === "number" ? `${Math.round(c.proba * 100)} %` : "—"}</td>}
                    <td className="text-right tabular-nums">
                      {c.matchsJoues}
                      <span className="text-faint text-[10px]">
                        /{rapport.compoProbableSur ?? rapport.matchsAnalyses}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rapport.numeros && (rapport.numeros.indices.length > 0 || rapport.numeros.notes.length > 0) && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="stat-label mb-1.5">Ce que disent les numeros</div>
              <ul className="space-y-1 text-xs leading-relaxed text-muted">
                {rapport.numeros.indices.slice(0, 4).map((i: any) => <li key={i.texte}>{i.texte}</li>)}
                {rapport.numeros.notes.map((n: string) => <li key={n} className="text-faint">{n}</li>)}
              </ul>
            </div>
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
        <section id="staff" className="panel scroll-mt-24 p-5">
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
                    <Link href={`/coachs/${c.coachId}`} className="hover:text-accent hover:underline">
                      <span className="text-faint">{c.prenom} </span>{c.nom}
                    </Link>
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
      <section id="joueurs" className="panel scroll-mt-24 p-5">
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

function Section({
  id, titre, icone, aide, children,
}: { id: string; titre: string; icone: React.ReactNode; aide?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-24 p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="h-section flex items-center gap-2">{icone}{titre}</h2>
        {aide && <span className="text-[11px] text-faint">{aide}</span>}
      </div>
      {children}
    </section>
  );
}

function ScoreCard({
  label, note, value, icon, color, absent,
}: { label: string; note: string; value: number | null; icon: React.ReactNode; color: string; absent?: string }) {
  return (
    <div className="stat-tile flex flex-col items-center justify-center gap-2 !px-2">
      <div className="stat-label flex items-center gap-1">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      {value === null ? (
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full border-2 border-dashed border-line2 font-display text-xl font-bold text-faint"
          role="img" aria-label={absent ?? "Non disponible"} title={absent}>—</div>
      ) : (
        <DonutStat value={value} size={72} stroke={8} color={color} label="/ 100"/>
      )}
      <div className="max-w-full truncate text-center text-[11px] text-muted">{note}</div>
    </div>
  );
}
