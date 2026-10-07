// src/features/prematch/components/RapportPrematchPage.tsx
//
// Rapport PRE-MATCH en un clic : mon equipe contre le club `clubId`, sur la saison choisie.
// Une seule page, lisible en deux minutes avant le match et imprimable (bouton "Imprimer / PDF") :
// pistes pour le match, comparatif, face-a-face, ce qu'il faut savoir de l'adversaire, arbitre.
// Les donnees viennent de GET /analyse/prematch ; rien n'est invente, chaque piste cite son chiffre.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, AlertTriangle, ArrowLeft, CalendarDays, Crosshair, Flag, HeartPulse, History, Info, MapPin, RotateCcw, Shield, Sparkles, Target, Users } from "lucide-react";

import { api } from "@/shared/lib/api";
import { resolveEquipePropre } from "@/features/equipes/lib/resolve-equipe-propre";
import { decimal } from "@/features/analyse/lib/tendances-format";
import { COULEUR_NIVEAU, LIBELLE_NIVEAU, niveauFatigue, plusFatigues } from "@/features/joueurs/lib/fatigue";
import { ClubBadge } from "@/features/clubs/components/ClubBadge";
import { InsightsGrid } from "@/features/analyse/components/InsightsGrid";
import { OngletsDossier } from "@/features/rapports/components/OngletsDossier";
import { Pitch } from "@/shared/ui/Pitch";

import { joueursSurTerrain, libellesPostes } from "../lib/onze-terrain";
import { BoutonImprimer } from "./BoutonImprimer";
import { ExportPowerPoint } from "./ExportPowerPoint";
import { PistesMatch } from "./PistesMatch";
import { ComparatifEquipes } from "./ComparatifEquipes";
import { JoueursAMenager } from "./JoueursAMenager";
import { ProjectionResultat } from "./ProjectionResultat";
import { SystemeProbable } from "./SystemeProbable";

export default async function RapportPrematch({
  params, searchParams,
}: { params: Promise<{ clubId: string }>; searchParams: Promise<{ matchId?: string }> }) {
  const { clubId: adversaireClubId } = await params;
  const { matchId: matchDemande } = await searchParams;
  const [equipes, saisons, matchs] = await Promise.all([api.equipes(), api.saisons(), api.matchs()]);
  const { equipe: maEquipe, saison } = await resolveEquipePropre({ equipes, saisons, matchs });

  if (!maEquipe) {
    return (
      <Vide titre="Choisissez d'abord votre equipe">
        Le rapport pre-match se lit du point de vue de votre equipe. Selectionnez-la dans la barre du haut, puis revenez ici.
      </Vide>
    );
  }
  if (maEquipe.clubId === adversaireClubId) {
    return <Vide titre="C'est votre propre club">Choisissez un club adverse pour preparer le match.</Vide>;
  }

  // Notre effectif : la fatigue n'est mesuree que sur la saison en cours.
  const [r, pagesExport, effectif] = await Promise.all([
    api.prematch(maEquipe.id, adversaireClubId, matchDemande ?? null), api.pagesPrematch(),
    saison?.actif ? api.effectifEquipe(maEquipe.id) : Promise.resolve([] as any[]),
  ]);
  if (!r) notFound();
  const aMenager = plusFatigues(effectif.filter((j: any) => j.id), 5);

  const { monEquipe: moi, adversaire: adv, analyse: a, arbitre, match, faceAFace: face } = r;
  const champ = [r.championnat.competition, r.championnat.poule ? `poule ${r.championnat.poule}` : null,
    r.championnat.saisonNom ? `saison ${r.championnat.saisonNom}` : null].filter(Boolean).join(" · ");
  const fatigue = niveauFatigue(a?.fatigueMoy ?? null);
  const faiblesses = a?.faiblesses ?? [];
  const genere = new Date(r.genereLe).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="space-y-5 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/rapports" className="flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft size={12} /> Retour rapports
        </Link>
        <OngletsDossier clubId={adversaireClubId} courant="prematch" prematchOuvert matchId={match?.id ?? null} />
        <div className="flex items-center gap-2">
          <ExportPowerPoint equipeId={maEquipe.id} adversaireId={adversaireClubId} matchId={match?.id ?? null} pages={pagesExport} />
          <BoutonImprimer />
        </div>
      </div>

      {/* En-tete : l'affiche du match */}
      <header className="panel p-6">
        <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
          Rapport pre-match<span className="sr-only"> : {moi.clubNom} contre {adv.clubNom}</span>
        </h1>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:justify-end sm:text-right">
            <div className="min-w-0 sm:order-1">
              <div className="truncate font-display text-xl font-bold text-ink sm:text-2xl">{moi.clubNom}</div>
              <div className="text-xs text-muted">{moi.equipeNom}</div>
            </div>
            <ClubBadge clubId={moi.clubId} size={56} className="sm:order-2" />
          </div>
          <div className="text-center font-display text-sm font-bold text-faint">VS</div>
          <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
            <ClubBadge clubId={adv.clubId} size={56} />
            <div className="min-w-0">
              <div className="truncate font-display text-xl font-bold text-ink sm:text-2xl">{adv.clubNom}</div>
              <div className="text-xs text-muted">{adv.rang !== null ? `${adv.rang}e du classement · ${adv.pts} pts` : "Hors classement"}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
          {champ && <span className="badge">{champ}</span>}
          {match ? (
            <>
              {match.journee && <span className="badge"><Flag size={11} aria-hidden /> Journee {match.journee.replace(/\D/g, "") || match.journee}</span>}
              {match.date && <span className="badge"><CalendarDays size={11} aria-hidden /> {match.date}{match.heure ? ` a ${match.heure}` : ""}</span>}
              <span className="badge badge-accent">{match.domicile ? "A domicile" : "A l'exterieur"}</span>
              {match.terrain && <span className="badge"><MapPin size={11} aria-hidden /> {match.terrain}</span>}
            </>
          ) : (
            <span className="badge badge-amber">Aucun match programme : rapport de preparation general</span>
          )}
        </div>
      </header>

      {/* Synthese */}
      <Section titre="Pistes pour le match" icone={<Sparkles size={11} className="text-accent" />}
        aide="constats chiffres, les plus importants d'abord">
        {r.pistes.length > 0 ? <PistesMatch pistes={r.pistes} /> : (
          <Note>
            Pas encore assez de matchs joues pour degager des pistes fiables. Le comparatif ci-dessous reste valable.
          </Note>
        )}
      </Section>

      {/* Comparatif */}
      <Section titre="Les deux equipes" icone={<Activity size={11} className="text-accent" />}
        aide="la meilleure valeur de chaque ligne est en couleur">
        <ComparatifEquipes moi={moi} adv={adv} domicileMoi={match ? match.domicile : null} />
        {(moi.matchs === 0 || adv.matchs === 0) && (
          <p className="mt-3 text-[11px] text-faint">
            {moi.matchs === 0 ? moi.clubNom : adv.clubNom} n'a pas encore de match joue sur cette saison : ses chiffres restent vides.
          </p>
        )}
      </Section>

      {/* Projection du resultat, et nos joueurs a menager */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section titre="Projection du resultat" icone={<Target size={11} className="text-accent" />}
          aide="modele de Poisson sur les moyennes de buts des deux equipes">
          <ProjectionResultat r={r} />
        </Section>
        <Section titre="Chez nous : joueurs a menager" icone={<HeartPulse size={11} className="text-accent" />}
          aide="les plus fatigues de l'effectif, charge des 28 derniers jours">
          <JoueursAMenager joueurs={aMenager as any} saisonActive={!!saison?.actif} />
        </Section>
      </div>

      {/* Face-a-face */}
      <Section titre="Face-a-face" icone={<History size={11} className="text-accent" />}
        aide={`${moi.equipeNom} contre ${adv.clubNom}, toutes saisons`}>
        {face.rencontres.length === 0 ? <Note>Aucune rencontre passee enregistree entre ces deux clubs.</Note> : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
            <div className="md:col-span-4">
              <div className="flex items-end gap-3">
                <div className="font-display text-4xl font-bold tabular-nums text-ink">{face.bilan.v}<span className="text-faint">-</span>{face.bilan.n}<span className="text-faint">-</span>{face.bilan.d}</div>
                <div className="pb-1 text-xs text-muted">V-N-D sur {face.bilan.joues} match{face.bilan.joues > 1 ? "s" : ""}</div>
              </div>
              <div className="mt-1 text-xs text-muted">Buts : {face.bilan.bp} marques, {face.bilan.bc} encaisses</div>
            </div>
            <ul className="space-y-1.5 md:col-span-8">
              {face.rencontres.slice(0, 5).map((x) => (
                <li key={x.matchId} className="panel-inset no-coupure flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={`pill-${x.issue.toLowerCase() as "v" | "n" | "d"}`}>{x.issue}</span>
                  <span className="tabular-nums font-semibold text-ink">{x.bp}-{x.bc}</span>
                  <span className="text-xs text-muted">{x.domicile ? "A domicile" : "A l'exterieur"}</span>
                  <span className="ml-auto text-xs text-faint">{x.date ?? ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Systeme de jeu probable : dispositifs renseignes et numeros de maillot */}
      <Section titre="Systeme de jeu probable" icone={<Crosshair size={11} className="text-accent" />}
        aide="dispositifs renseignes sur ses matchs et changements de numero de maillot : la feuille de match ne donne pas le dispositif">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <div className={r.systemeAdverse.probable && r.numeros?.onze.length ? "md:col-span-7" : "md:col-span-12"}>
            <SystemeProbable donnees={r.systemeAdverse} numeros={r.numeros} adversaire={adv.clubNom} />
          </div>
          {r.systemeAdverse.probable && r.numeros && r.numeros.onze.length > 0 && (
            <div className="mx-auto w-full max-w-[300px] md:col-span-5">
              <Pitch formation={r.systemeAdverse.probable.systeme} couleur="rgb(var(--sky))" titre="Onze probable"
                joueurs={joueursSurTerrain(r.numeros.onze, r.systemeAdverse.probable.disposition)}
                libellesPostes={libellesPostes(r.numeros.onze, r.systemeAdverse.probable.disposition)} />
            </div>
          )}
        </div>
      </Section>

      {/* Adversaire */}
      {a ? (
        <>
          <Section titre={`Ce qu'il faut savoir sur ${adv.clubNom}`} icone={<Crosshair size={11} className="text-accent" />}
            aide={<>{a.matchsAnalyses} match{a.matchsAnalyses > 1 ? "s" : ""} analyse{a.matchsAnalyses > 1 ? "s" : ""}
              {a.entraineur && <> · entraineur : {a.entraineurId
                ? <Link href={`/coachs/${a.entraineurId}`} className="text-accent underline underline-offset-2">{a.entraineur}</Link> : a.entraineur}</>}</>}>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Chiffre label="Danger" valeur={decimal(a.scoreDanger, 0)} suffixe="/ 100" note="menace offensive" />
              <Chiffre label="Stabilite du onze" valeur={decimal(100 - a.scoreChaos, 0)} suffixe="/ 100" note={a.scoreChaos >= 50 ? "onze tres change" : "onze stable"} />
              <Chiffre label="Fatigue" valeur={a.fatigueMoy === null ? "—" : decimal(a.fatigueMoy, 0)} suffixe={a.fatigueMoy === null ? "" : "/ 100"}
                note={fatigue ? `${LIBELLE_NIVEAU[fatigue]} (titulaires)` : "non mesurable"} couleur={fatigue ? COULEUR_NIVEAU[fatigue] : undefined} />
              <Chiffre label="Changements" valeur={decimal(a.changementsMoyenne, 1)} suffixe="/ match" note="moyenne" />
            </div>
            {a.insights.length > 0 && <InsightsGrid insights={a.insights as any} />}
          </Section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Section titre="Onze probable" icone={<Users size={11} className="text-accent" />}
              aide={a.compoProbableSource === "modele"
                ? `predit par l'IA (${a.compoProbableModele ?? "modele actif"}) : la chance de chaque joueur de commencer`
                : r.numeros?.fiabilite.exploitable ? `un joueur par numero de maillot, sur ses ${r.numeros.matchs} dernieres feuilles` : "titulaires les plus utilises, par poste"}>
              {a.compoProbable.length === 0 ? <Note>Composition non disponible.</Note> : (
                <ul className="divide-y divide-line">
                  {[...a.compoProbable].sort((x, y) => (x.numero ?? 99) - (y.numero ?? 99)).map((j) => (
                    <li key={`${j.poste}-${j.nom}`} className="flex items-center gap-3 py-1.5 text-sm">
                      <span className="w-6 text-right font-mono text-xs text-faint">{j.numero ?? ""}</span>
                      <span className="badge w-12 justify-center">{j.poste}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{j.nom}</span>
                      {typeof j.proba === "number" && <span className="text-xs font-semibold tabular-nums text-ink" title="Chance de commencer le match, d'apres l'IA">{Math.round(j.proba * 100)} %</span>}
                      <span className="text-xs tabular-nums text-faint">{j.matchsJoues} titu.</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section titre="Joueurs a surveiller" icone={<Shield size={11} className="text-accent" />}
              aide="points par match avec eux, en plus">
              {a.joueursCles.length === 0 ? <Note>Pas assez de matchs pour isoler des joueurs cles.</Note> : (
                <ul className="divide-y divide-line">
                  {a.joueursCles.map((j) => (
                    <li key={`${j.joueurId ?? j.nom}`} className="flex items-center gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-ink">{[j.prenom, j.nom].filter(Boolean).join(" ")}</div>
                        <div className="text-[11px] text-muted">{j.poste ?? "—"} · {j.titularisations} titularisation{j.titularisations > 1 ? "s" : ""} · {j.matchsAvec} matchs</div>
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-win">+{decimal(j.delta, 2)} pt/m.</span>
                    </li>
                  ))}
                </ul>
              )}
              {a.avertis.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="h-section mb-2 flex items-center gap-2"><AlertTriangle size={11} className="text-amber" /> Les plus sanctionnes <span className="font-normal normal-case tracking-normal text-faint">cartons de la saison</span></div>
                  <ul className="space-y-1">
                    {a.avertis.map((j) => (
                      <li key={j.nom} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-ink">{j.nom}</span>
                        <span className="text-xs tabular-nums text-muted">{j.jaunes} jaune{j.jaunes > 1 ? "s" : ""}{j.rouges > 0 ? ` · ${j.rouges} rouge${j.rouges > 1 ? "s" : ""}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          </div>

          {faiblesses.length > 0 && (
            <Section titre="Points faibles identifies" icone={<AlertTriangle size={11} className="text-amber" />} aide="a cibler pendant le match">
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {faiblesses.map((f) => (
                  <li key={f.titre} className="panel-inset no-coupure border-l-[3px] border-l-amber p-3.5">
                    <div className="text-sm font-semibold text-ink">{f.titre}</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{f.detail}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : (
        <Section titre={`Ce qu'il faut savoir sur ${adv.clubNom}`} icone={<Crosshair size={11} className="text-accent" />}>
          <Note>
            Aucune feuille de match de {adv.clubNom} n'a ete analysee sur cette saison : pas de composition probable ni de joueur cle.
            Importez ses feuilles FMI pour enrichir ce rapport.
          </Note>
        </Section>
      )}

      {/* Arbitre */}
      <Section titre="Arbitre" icone={<RotateCcw size={11} className="text-accent" />}
        aide={match ? undefined : "disponible quand un match est programme avec son arbitre"}>
        {arbitre ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Chiffre label="Arbitre" valeur={arbitre.nom} note={arbitre.profil ? `profil ${arbitre.profil.toLowerCase()}` : "profil non determine"} petit />
              <Chiffre label="Matchs au sifflet" valeur={String(arbitre.matchsPrincipal)} note="comme arbitre central" />
              <Chiffre label="Cartons / match" valeur={decimal(arbitre.cartonsParMatch, 1)} note={`${arbitre.cartonsJaunes} jaunes · ${arbitre.cartonsRouges} rouges`} />
            </div>
            {arbitre.motifsTop && (
              <div className="mt-3">
                <div className="stat-label mb-1.5">Sanctions les plus donnees</div>
                <ul className="flex flex-wrap gap-1.5">
                  {arbitre.motifsTop.split(" · ").map((m) => <li key={m} className="badge">{m}</li>)}
                </ul>
              </div>
            )}
          </>
        ) : (
          <Note>{match?.id ? "Aucun arbitre designe (ou inconnu de la base) pour ce match." : "Pas de match cible, donc pas d'arbitre."}</Note>
        )}
      </Section>

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-faint">
        <Info size={11} aria-hidden /> Rapport genere le {genere} a partir des feuilles de match importees. Les chiffres sous le seuil d'echantillon ne donnent lieu a aucune piste.
      </p>
    </div>
  );
}

function Section({
  titre, icone, aide, children,
}: { titre: string; icone: React.ReactNode; aide?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="h-section flex items-center gap-2">{icone}{titre}</h2>
        {aide && <span className="text-[11px] text-faint">{aide}</span>}
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function Chiffre({
  label, valeur, suffixe, note, couleur, petit,
}: { label: string; valeur: string; suffixe?: string; note: string; couleur?: string; petit?: boolean }) {
  return (
    <div className="stat-tile no-coupure">
      <div className="stat-label">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`font-display font-bold tabular-nums ${petit ? "text-base leading-snug" : "text-3xl"} text-ink`} style={couleur ? { color: couleur } : undefined}>{valeur}</span>
        {suffixe && <span className="stat-suffix">{suffixe}</span>}
      </div>
      <div className="mt-1 text-[11px] text-muted">{note}</div>
    </div>
  );
}

function Vide({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 fade-up">
      <Link href="/rapports" className="flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft size={12} /> Retour rapports</Link>
      <section className="panel space-y-2 p-8 text-center">
        <div className="font-display text-lg font-bold text-ink">{titre}</div>
        <p className="mx-auto max-w-xl text-sm text-muted">{children}</p>
      </section>
    </div>
  );
}
