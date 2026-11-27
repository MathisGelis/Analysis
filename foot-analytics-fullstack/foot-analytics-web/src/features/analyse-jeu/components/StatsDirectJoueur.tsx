"use client";
// src/features/analyse-jeu/components/StatsDirectJoueur.tsx
//
// Les stats d'un joueur de mon club tirees du jeu saisi en direct (onglet « Stats » de sa fiche), selon son poste : un gardien voit ses arrets,
// ses buts encaisses et ses buts evites, jamais de buts ni de tirs ; un joueur de champ voit sa finition et sa creation, jamais d'arrets (les
// passes cles restent pour tous). Rapportees a 90 minutes quand on connait ses minutes, comparees a l'effectif et a sa forme recente.

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, messageApi } from "@/shared/lib/api";
import { Spinner } from "@/shared/ui/Spinner";

import type { ReponseStatsJoueur, StatsJoueurDirect } from "../lib/data-hub-types";
import { nb, pc, signe } from "../lib/format-hub";
import { famillePoste, formeRecente, LIBELLE_FAMILLE, MINUTES_MIN_PAR90, ordinal, par90, rangsAffiches, sectionsPour, type FamillePoste } from "../lib/stats-joueur";
import { CarteTirs } from "./CarteTirs";
import { BarresTranches, Camembert } from "./graphiques";
import { LieuMatch } from "./LieuMatch";

function Tuile({ libelle, valeur, detail }: { libelle: string; valeur: string | number; detail?: string }) {
  return (
    <div className="panel-inset p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">{libelle}</div>
      <div className="font-display text-2xl font-bold tabular-nums text-ink">{valeur}</div>
      {detail && <div className="text-[11px] text-faint">{detail}</div>}
    </div>
  );
}

function Bloc({ titre, children, testid }: { titre: string; children: React.ReactNode; testid?: string }) {
  return <section aria-label={titre} className="space-y-3" data-testid={testid}><h3 className="text-sm font-semibold text-ink">{titre}</h3>{children}</section>;
}

const NOMS_TRANCHES = ["0–15", "15–30", "30–45", "45–60", "60–75", "75–90"];

export function StatsDirectJoueur({ joueurId, saisonId, nomSaison, poste, numero }: { joueurId: string; saisonId?: string | null; nomSaison?: string | null; poste?: string | null; numero?: number | null }) {
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
  // Un joueur attribue comme gardien pendant la saisie est gardien, quel que soit le poste de sa fiche.
  const famille: FamillePoste = s.gardien && s.gardien.matchs >= 1 && s.tirs === 0 ? "gardien" : famillePoste(poste, numero);

  return (
    <section aria-labelledby="titre-stats-direct" className="panel space-y-5 p-5" data-testid="stats-direct-joueur" data-famille={famille}>
      <div>
        <h2 id="titre-stats-direct" className="h-section">Stats du direct · {nomSaison ?? "saison"} · {LIBELLE_FAMILLE[famille]}</h2>
        <p className="mt-1 text-xs text-muted">Les stats pertinentes à son poste, d&apos;après les matchs saisis en direct. xG : estimation d&apos;après la zone et le contexte du tir.</p>
      </div>
      {s.matchs === 0 ? (
        <p className="text-sm text-muted">
          Rien n&apos;est attribué à ce joueur dans les {r.matchsSaisis} match{r.matchsSaisis > 1 ? "s" : ""} saisi{r.matchsSaisis > 1 ? "s" : ""} en direct cette saison.
          Désigne-le (tireur, passeur, gardien, fautif…) pendant la saisie pour que ses actions apparaissent ici.
        </p>
      ) : (
        <Contenu r={r} s={s} famille={famille} />
      )}
    </section>
  );
}

function Contenu({ r, s, famille }: { r: ReponseStatsJoueur; s: StatsJoueurDirect; famille: FamillePoste }) {
  const minutes = s.presence?.minutes ?? null;
  const assezDeMinutes = minutes !== null && minutes >= MINUTES_MIN_PAR90;
  const p90 = (v: number) => par90(v, minutes);
  const rangs = rangsAffiches(r.rangs ?? [], famille);
  const forme = formeRecente(s.parMatch, famille);
  const sections = sectionsPour(famille, s);
  const rendu: Record<string, React.ReactNode> = {
    gardien: s.gardien && <Gardien s={s} g={s.gardien} p90={p90} />,
    creation: <Creation s={s} p90={p90} />,
    finition: <Finition s={s} p90={p90} />,
    discipline: <Discipline s={s} p90={p90} />,
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile libelle="Matchs saisis" valeur={s.presence?.matchs ?? s.matchs} detail={s.presence ? `${s.presence.titularisations} titularisation${s.presence.titularisations > 1 ? "s" : ""}` : `sur ${r.matchsSaisis} saisis`} />
        <Tuile libelle="Minutes" valeur={minutes ?? "–"} detail={minutes !== null ? `${nb(minutes / Math.max(1, s.presence!.matchs), 0)} par match` : "feuille de match inconnue"} />
        {famille === "gardien"
          ? <><Tuile libelle="Arrêts" valeur={s.gardien?.arrets ?? 0} /><Tuile libelle="Buts encaissés" valeur={s.gardien?.butsEncaisses ?? 0} detail="quand il est dans les buts" /></>
          : <><Tuile libelle="Buts" valeur={s.buts} /><Tuile libelle="Passes décisives" valeur={s.passes} /></>}
      </div>
      {!assezDeMinutes && minutes !== null && <p className="text-[11px] text-faint">Moins de {MINUTES_MIN_PAR90} minutes saisies : les chiffres « par 90 minutes » sont indicatifs.</p>}

      {rangs.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Rang dans l'effectif" data-testid="rangs-effectif">
          {rangs.map((x) => (
            <li key={x.cle} className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink">
              <strong className="text-accent">{ordinal(x.rang)}</strong> en {x.libelle} <span className="text-faint">({x.cle === "xg" ? nb(x.valeur, 2) : x.valeur} · sur {x.sur})</span>
            </li>
          ))}
        </ul>
      )}

      {sections.map((id) => <div key={id}>{rendu[id]}</div>)}

      <Forme forme={forme} />
      <TableauMatchs s={s} famille={famille} />
    </>
  );
}

type P90 = (v: number) => number | null;
const detail90 = (v: number | null) => (v === null ? undefined : `${nb(v, 2)} par 90 min`);

function Gardien({ s, g, p90 }: { s: StatsJoueurDirect; g: NonNullable<StatsJoueurDirect["gardien"]>; p90: P90 }) {
  const pctArrets = g.tirsCadres ? Math.round((g.arrets / g.tirsCadres) * 100) : null;
  return (
    <Bloc titre="Dans les buts" testid="stats-gardien">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile libelle="Arrêts" valeur={g.arrets} detail={detail90(p90(g.arrets))} />
        <Tuile libelle="% d'arrêts" valeur={pc(pctArrets)} detail={`${g.arrets} sur ${g.tirsCadres} tirs cadrés`} />
        <Tuile libelle="Buts encaissés" valeur={g.butsEncaisses} detail={detail90(p90(g.butsEncaisses))} />
        <Tuile libelle="Buts évités" valeur={signe(g.butsEvites)} detail={`${nb(g.xgCadres, 2)} xG cadré − ${g.butsEncaisses}`} />
        <Tuile libelle="Clean sheets" valeur={g.cleanSheets} detail={`${g.matchs} match${g.matchs > 1 ? "s" : ""} dans les buts`} />
        <Tuile libelle="Penaltys arrêtés" valeur={`${g.penaltysArretes}/${g.penaltysSubis}`} detail="arrêtés / subis" />
      </div>
      {g.tirsCadres > 0 && <Camembert titre="Tirs cadrés subis" unite=" tirs" centre={`${g.tirsCadres}`} parts={[{ libelle: "Arrêtés", valeur: g.arrets }, { libelle: "Buts encaissés", valeur: g.butsEncaisses }].filter((x) => x.valeur > 0)} />}
      <p className="text-[11px] text-faint">Les arrêts sont attribués au gardien dans les buts à la minute du tir (avant-match et remplacements). Les relances, sorties aériennes et duels ne sont pas mesurés. {s.gardien ? "" : ""}</p>
    </Bloc>
  );
}

function Creation({ s, p90 }: { s: StatsJoueurDirect; p90: P90 }) {
  return (
    <Bloc titre="Création" testid="stats-creation">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile libelle="Passes décisives" valeur={s.passes} detail={detail90(p90(s.passes))} />
        <Tuile libelle="Passes clés" valeur={s.passesCles} detail={detail90(p90(s.passesCles)) ?? "avant un tir non marqué"} />
        <Tuile libelle="Corners tirés" valeur={s.corners} />
        <Tuile libelle="Coups francs" valeur={`${s.coupsFrancs.buts}/${s.coupsFrancs.tires}`} detail="buts / tirés" />
      </div>
    </Bloc>
  );
}

function Finition({ s, p90 }: { s: StatsJoueurDirect; p90: P90 }) {
  const conv = s.tirs ? Math.round((s.buts / s.tirs) * 100) : null;
  const cadres = s.tirs ? Math.round((s.cadres / s.tirs) * 100) : null;
  return (
    <Bloc titre="Finition" testid="stats-finition">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile libelle="Buts" valeur={s.buts} detail={detail90(p90(s.buts))} />
        <Tuile libelle="Tirs" valeur={s.tirs} detail={detail90(p90(s.tirs))} />
        <Tuile libelle="Tirs cadrés" valeur={pc(cadres)} detail={`${s.cadres} sur ${s.tirs}`} />
        <Tuile libelle="Conversion" valeur={pc(conv)} detail="buts / tirs" />
        <Tuile libelle="xG créé" valeur={nb(s.xg, 2)} detail={detail90(p90(s.xg))} />
        <Tuile libelle="Buts − xG" valeur={signe(s.buts - s.xg)} detail="positif : plus efficace que prévu" />
        <Tuile libelle="xG par tir" valeur={nb(s.tirs ? s.xg / s.tirs : null, 2)} detail="qualité moyenne des tirs" />
        <Tuile libelle="Grosses occasions" valeur={s.grosses.total} detail={`${s.grosses.marquees} marquée${s.grosses.marquees > 1 ? "s" : ""}`} />
        <Tuile libelle="Penaltys" valeur={`${s.penaltys.marques}/${s.penaltys.tires}`} detail="marqués / tirés" />
        <Tuile libelle="Buts sur CPA" valeur={s.butsCpa} detail={s.buts ? `${Math.round((s.butsCpa / s.buts) * 100)} % de ses buts` : undefined} />
        <Tuile libelle="Minutes par but" valeur={s.buts && s.presence ? Math.round(s.presence.minutes / s.buts) : "–"} />
        <Tuile libelle="Minutes par tir" valeur={s.tirs && s.presence ? Math.round(s.presence.minutes / s.tirs) : "–"} />
      </div>
      {s.tirsDetail.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div><div className="mb-2 text-xs uppercase tracking-wide text-muted">Ses tirs : terrain et cage</div><CarteTirs nous={s.tirsDetail} equipeNous="Ses tirs" /></div>
          <div className="space-y-4">
            {s.familles.length > 0 && (<div><div className="mb-2 text-xs uppercase tracking-wide text-muted">Comment il frappe</div>
              <Camembert titre="Tirs par famille de jeu" unite=" tirs" centre={`${s.tirs}`} parts={s.familles.map((f) => ({ libelle: f.famille, valeur: f.tirs, detail: `${f.buts} buts` }))} /></div>)}
            <div><div className="mb-2 text-xs uppercase tracking-wide text-muted">Quand il frappe et marque</div>
              <BarresTranches titre="Tirs et buts par tranche de 15 minutes" noms={NOMS_TRANCHES} pour={s.tranches.tirs} contre={s.tranches.buts} legende={["Tirs", "Buts"]} /></div>
          </div>
        </div>
      )}
    </Bloc>
  );
}

function Discipline({ s, p90 }: { s: StatsJoueurDirect; p90: P90 }) {
  return (
    <Bloc titre="Discipline" testid="stats-discipline">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile libelle="Fautes" valeur={s.fautes} detail={detail90(p90(s.fautes))} />
        <Tuile libelle="Cartons jaunes" valeur={s.jaunes} />
        <Tuile libelle="Cartons rouges" valeur={s.rouges} />
        <Tuile libelle="Hors-jeux" valeur={s.horsJeux} />
        <Tuile libelle="Remplacements" valeur={`${s.entrees} ↑ ${s.sorties} ↓`} detail="entrées · sorties" />
        <Tuile libelle="Blessures" valeur={s.blessures} detail="notées en direct" />
      </div>
    </Bloc>
  );
}

function Forme({ forme }: { forme: ReturnType<typeof formeRecente> }) {
  if (forme.recents < 3) return null;
  return (
    <Bloc titre={`Forme : ${forme.recents} derniers matchs saisis contre la saison`} testid="stats-forme">
      <div className="overflow-x-auto">
        <table className="table-fm">
          <thead><tr><th>Indicateur</th><th className="text-right">Saison</th><th className="text-right">{forme.recents} derniers</th><th className="text-center"><span className="sr-only">Évolution</span></th></tr></thead>
          <tbody>
            {forme.lignes.map((l) => {
              const mieux = l.saison !== null && l.recent !== null && l.saison !== l.recent ? (l.recent > l.saison) === l.meilleurSiHaut : null;
              return (
                <tr key={l.cle}>
                  <td className="text-muted">{l.libelle}</td>
                  <td className="text-right tabular-nums">{nb(l.saison, 2)}</td>
                  <td className="text-right font-semibold tabular-nums text-ink">{nb(l.recent, 2)}</td>
                  <td className={`text-center ${mieux === null ? "text-faint" : mieux ? "text-win" : "text-loss"}`} aria-label={mieux === null ? "stable" : mieux ? "en progrès" : "en recul"}>{mieux === null ? "=" : mieux ? "▲" : "▼"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Bloc>
  );
}

function TableauMatchs({ s, famille }: { s: StatsJoueurDirect; famille: FamillePoste }) {
  const gardien = famille === "gardien";
  return (
    <Bloc titre="Match par match" testid="stats-matchs">
      <div className="overflow-x-auto">
        <table className="table-fm">
          <thead>
            <tr>
              <th>Match</th><th className="text-center">Score</th><th className="text-right max-sm:hidden">Min.</th>
              {gardien ? <><th className="text-center">Arrêts</th><th className="text-center">Encaissés</th></> : <><th className="text-center">B</th><th className="text-center">PD</th><th className="text-center">Tirs</th><th className="text-right max-sm:hidden">xG</th></>}
              <th className="text-center max-sm:hidden">PC</th><th className="text-center max-sm:hidden">Fautes</th><th className="text-center">Cartons</th>
            </tr>
          </thead>
          <tbody>
            {s.parMatch.map((m) => (
              <tr key={m.matchId}>
                <td>
                  <Link href={`/matchs/${m.matchId}`} className="flex flex-wrap items-center gap-x-2 hover:text-accent">
                    <LieuMatch domicile={m.domicile} /> <span>{m.adversaire}</span> <span className="text-[11px] text-faint">{m.date ?? ""}</span>
                  </Link>
                </td>
                <td className="text-center tabular-nums">{m.bp}–{m.bc}</td>
                <td className="text-right tabular-nums text-muted max-sm:hidden">{m.minutes ?? "–"}</td>
                {gardien
                  ? <><td className="text-center tabular-nums">{m.arrets || ""}</td><td className="text-center tabular-nums">{m.butsEncaisses || ""}</td></>
                  : <><td className="text-center tabular-nums">{m.buts || ""}</td><td className="text-center tabular-nums">{m.passes || ""}</td><td className="text-center tabular-nums">{m.tirs || ""}</td><td className="text-right tabular-nums max-sm:hidden">{m.tirs ? nb(m.xg, 2) : ""}</td></>}
                <td className="text-center tabular-nums max-sm:hidden">{m.passesCles || ""}</td>
                <td className="text-center tabular-nums max-sm:hidden">{m.fautes || ""}</td>
                <td className="text-center text-xs">{m.jaunes > 0 && <span className="text-amber">CJ</span>}{m.rouges > 0 && <span className="ml-1 text-danger">CR</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-faint">B = buts, PD = passes décisives, PC = passes clés. « – » : minutes inconnues (feuille de match absente).</p>
    </Bloc>
  );
}
