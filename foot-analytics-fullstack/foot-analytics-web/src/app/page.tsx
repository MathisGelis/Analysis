// src/app/page.tsx
//
// Dashboard — grille "bento" sur fond de soiree de match.
//
// Composition :
//  - Hero : Mon club + saison, rang / points / difference, forme et repartition V-N-D
//  - Prochaine echeance et dernier match, cote a cote
//  - 4 indicateurs avec leur courbe sur les matchs joues
//  - Tops joueurs : forme, buteurs, indiscipline
//  - Mini classement de la poule (les lignes autour de mon rang)
//
// Tout est filtre par saison choisie dans le switcher (cf. maj 49).
// Animations : fade-up stagger sur les sections, count-up sur les
// chiffres importants.

import Link from "next/link";
import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { bilanDesResultats, resultatsDeLEquipe } from "@/lib/matchs-equipe";
import {
  diffButs, fenetreClassement, ligneDeLEquipe, lignesDuChampionnat,
} from "@/lib/classement";
import { ClubBadge } from "@/components/ClubBadge";
import { CountUp } from "@/components/CountUp";
import { Sparkline } from "@/components/Charts";
import { plusFatigues } from "@/lib/fatigue";
import {
  ArrowRight, ArrowUpRight, Calendar, Crosshair, Flag, Flame,
  MapPin, ShieldAlert, Target, Trophy, Upload,
} from "lucide-react";
import type { Issue } from "@/lib/types";

export const metadata = { title: "Dashboard · Foot Analytics" };

export default async function Dashboard() {
  const CLUB_PROPRE_ID = getOwnClubIdServer();

  const [clubs, classement, matchs, equipes, saisons] = await Promise.all([
    api.clubs(),
    api.classement(),
    api.matchs(),
    api.equipes(),
    api.saisons(),
  ]);

  // Tout le dashboard se lit du point de vue de MON EQUIPE (resolue depuis
  // les cookies) et de SON championnat : un club aligne plusieurs equipes
  // (Seniors, U20...) dont les matchs, classements et joueurs ne se melangent
  // pas.
  const { equipe, saison: saisonChoisie, equipesDuChampionnat } =
    await resolveEquipePropre({ equipes, saisons, matchs });
  const clubPropreId = equipe?.clubId ?? CLUB_PROPRE_ID;
  const club = clubs.find((c: any) => c.id === clubPropreId);
  const clubNom = (id: string) => clubs.find((c: any) => c.id === id)?.nom ?? id;

  // Effectif de l'equipe : statistiques calculees sur SES matchs (pas les
  // cumuls de carriere de la fiche joueur).
  const effectif: any[] = equipe ? await api.effectifEquipe(equipe.id) : [];
  const estSaisonActive = saisonChoisie?.actif === true;

  // Matchs et bilan de l'equipe.
  const { joues, aVenir } = equipe
    ? resultatsDeLEquipe(matchs, equipe.id)
    : { joues: [], aVenir: [] };
  const bilan = bilanDesResultats(joues);
  const dernier = joues[joues.length - 1];
  const prochain = aVenir[0];
  const formeRecente: Issue[] = joues.slice(-10).map((r) => r.issue);

  // Classement du championnat de l'equipe, et ma ligne dedans.
  const lignes = lignesDuChampionnat(classement, equipesDuChampionnat);
  const maLigne = ligneDeLEquipe(lignes, equipe?.id);
  const tableauPoule = fenetreClassement(lignes, equipe?.id, 5);
  const diff = maLigne ? diffButs(maLigne) : bilan.bp - bilan.bc;

  // Joueurs : tops. La fatigue est un instantane du moment present :
  // elle n'a de sens que sur la saison active (cf. effectif()).
  const topFatigue = estSaisonActive ? plusFatigues(effectif, 5) : [];
  const topButeurs = [...effectif]
    .filter((j) => (j.buts ?? 0) > 0)
    .sort((a, b) => (b.buts ?? 0) - (a.buts ?? 0))
    .slice(0, 5);
  const topDiscipline = [...effectif]
    .filter((j) => (j.cartonsJaunes ?? 0) + (j.cartonsRouges ?? 0) > 0)
    .sort((a, b) =>
      ((b.cartonsJaunes ?? 0) + (b.cartonsRouges ?? 0) * 3)
      - ((a.cartonsJaunes ?? 0) + (a.cartonsRouges ?? 0) * 3))
    .slice(0, 5);
  const totalCJ = effectif.reduce((s, j) => s + (j.cartonsJaunes ?? 0), 0);
  const totalCR = effectif.reduce((s, j) => s + (j.cartonsRouges ?? 0), 0);
  // Les FMI n'ont pas toujours le tableau des buteurs : on le dit plutot
  // que d'afficher "aucun but" a une equipe qui en a marque 56.
  const butsAttribues = effectif.reduce((s, j) => s + (j.buts ?? 0), 0);
  const messageButeurs = bilan.bp > 0 && butsAttribues === 0
    ? "Buteurs non renseignes dans les feuilles de match importees."
    : "Pas de but inscrit cette saison.";

  // Courbes des indicateurs : une valeur par match joue, dans l'ordre.
  const serieButsPour = joues.map((r) => r.butsMarques);
  const serieButsContre = joues.map((r) => r.butsEncaisses);
  const seriePoints = joues.reduce<number[]>((acc, r) => {
    acc.push((acc[acc.length - 1] ?? 0) + (r.issue === "V" ? 3 : r.issue === "N" ? 1 : 0));
    return acc;
  }, []);
  const maxTop = (items: { valeur: number }[]) => Math.max(1, ...items.map((i) => i.valeur));

  return (
    <div className="space-y-5 fade-up-stagger">

      {/* ============================================================
          HERO : mon club, ma saison, mon classement
          ============================================================ */}
      <header className="panel relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accentstrong/[0.18] via-transparent to-accent2/[0.08]" />
        <div className="pitch-lines" />

        <div className="relative grid grid-cols-12 items-center gap-6 p-6 sm:p-8">
          <div className="col-span-12 flex items-center gap-5 lg:col-span-6">
            <div className="relative shrink-0">
              <div className="absolute inset-0 -z-0 rounded-full bg-accentstrong/30 blur-2xl" aria-hidden="true" />
              <ClubBadge clubId={clubPropreId} size={88} className="relative" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-section">Mon club</span>
                {saisonChoisie && (
                  <span className={`badge ${saisonChoisie.actif ? "badge-accent" : ""}`}>
                    {saisonChoisie.actif && <span className="pulse-live h-1.5 w-1.5 rounded-full bg-accent" />}
                    Saison {saisonChoisie.nom}
                  </span>
                )}
              </div>
              <h1 className="mt-1.5">
                <Link href={`/club/${clubPropreId}`}
                  className="block font-display text-3xl font-bold leading-[1.05] text-ink transition-colors hover:text-accent sm:text-[40px]">
                  {club?.nom ?? "Club non defini"}
                </Link>
              </h1>
              {equipe ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                  <span className="font-medium text-ink">{equipe.nom}</span>
                  {equipe.competitionLibelle && <span className="text-faint">·</span>}
                  {equipe.competitionLibelle && <span>{equipe.competitionLibelle}</span>}
                </div>
              ) : (
                <div className="mt-2 text-sm text-amber">
                  Aucune equipe sur cette saison : choisis-en une dans le selecteur de la barre laterale.
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-6">
            <HeroStat label="Rang" value={maLigne?.rang ?? "—"} suffix={maLigne ? `/ ${lignes.length}` : undefined}
              icon={<Trophy size={13} />} gradient />
            <HeroStat label="Points" value={maLigne?.pts ?? bilan.pts} gradient />
            <HeroStat label="Diff. buts" value={diff} showSign tone={diff >= 0 ? "win" : "loss"} />
            <HeroStat label="Joues" value={maLigne?.joues ?? bilan.joues} icon={<Calendar size={13} />} />
          </div>
        </div>

        {/* Forme et repartition */}
        {formeRecente.length > 0 && (
          <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line/70 bg-panel2/40 px-6 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="h-section">Forme</span>
              <div className="flex flex-wrap items-center gap-1">
                {formeRecente.map((r, i) => (
                  <span key={i} className={r === "V" ? "pill-v" : r === "N" ? "pill-n" : "pill-d"}>{r}</span>
                ))}
              </div>
            </div>
            <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-3 sm:max-w-sm">
              <RepartitionBar v={bilan.v} n={bilan.n} d={bilan.d} />
            </div>
          </div>
        )}
      </header>

      {/* ============================================================
          BENTO : prochaine echeance (large) + dernier match
          ============================================================ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">

        <div className="panel relative overflow-hidden p-6 lg:col-span-8">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <span className="h-section">Prochaine echeance</span>
              <h2 className="mt-1 font-display text-2xl font-bold text-ink">
                {prochain ? `Journee ${prochain.journee ?? "—"}` : "Aucun match a venir"}
              </h2>
            </div>
            {prochain && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Link href={`/matchs/${prochain.id}`} className="btn text-sm">Fiche du match</Link>
                <Link href={`/rapports/prematch/${prochain.equipeDomId === equipe?.id ? prochain.clubExt : prochain.clubDom}?matchId=${prochain.id}`}
                  className="btn btn-primary text-sm">
                  Rapport pre-match <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>

          {prochain ? (() => {
            const dom = prochain.equipeDomId === equipe?.id;
            const advId = dom ? prochain.clubExt : prochain.clubDom;
            return (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-line bg-panel2/60 p-5">
                <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:justify-end sm:text-right">
                  <div className="min-w-0 sm:order-1">
                    <div className="truncate font-display text-lg font-bold text-ink">{club?.nom ?? "Mon club"}</div>
                    <div className="text-xs text-muted">{dom ? "A domicile" : "A l'exterieur"}</div>
                  </div>
                  <ClubBadge clubId={clubPropreId} size={56} className="sm:order-2" />
                </div>
                <div className="text-center">
                  <div className="font-display text-sm font-bold text-faint">VS</div>
                  {prochain.date && <div className="mt-1 badge">{prochain.date}</div>}
                </div>
                <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                  <ClubBadge clubId={advId} size={56} />
                  <div className="min-w-0">
                    <div className="truncate font-display text-lg font-bold text-ink">{clubNom(advId)}</div>
                    <div className="text-xs text-muted">{dom ? "Visiteur" : "Recoit"}</div>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="grid place-items-center rounded-2xl border border-dashed border-line2 py-10 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent"><MapPin size={22} /></div>
              <p className="max-w-sm text-sm text-muted">
                Pas de match programme dans la base. Importe une feuille de match pour alimenter le calendrier.
              </p>
              <Link href="/import" className="btn btn-primary mt-4 text-sm"><Upload size={14} /> Importer une feuille FMI</Link>
            </div>
          )}
        </div>

        <div className="panel p-6 lg:col-span-4">
          <span className="h-section">Dernier match</span>
          {dernier ? (
            <Link href={`/matchs/${dernier.matchId}`} className="group mt-3 block">
              <div className="flex items-center gap-3">
                <ClubBadge clubId={dernier.advClubId} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{dernier.lieu}</div>
                  <div className="truncate font-display text-lg font-bold text-ink transition-colors group-hover:text-accent">
                    {clubNom(dernier.advClubId)}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex items-end gap-3">
                <div className={`font-display text-[56px] font-bold leading-none tabular-nums ${
                  dernier.issue === "V" ? "text-gradient" : "text-ink"}`}>
                  {dernier.butsMarques}<span className="mx-1 text-faint">-</span>{dernier.butsEncaisses}
                </div>
                <span className={`pill-${dernier.issue.toLowerCase() as "v" | "n" | "d"} mb-1.5 ml-auto`}>{dernier.issue}</span>
              </div>
              <div className="mt-3 text-xs text-faint">
                Journee {dernier.journee.replace(/\D/g, "")} · {dernier.date}
              </div>
            </Link>
          ) : (
            <div className="py-8 text-sm text-muted">Aucun match joue.</div>
          )}
        </div>
      </section>

      {/* ============================================================
          INDICATEURS : chacun avec sa courbe sur les matchs joues
          ============================================================ */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Matchs joues" value={bilan.joues} icon={<Calendar size={14} />}
          serie={seriePoints} serieLabel="Points cumules" />
        <Kpi label="Buts marques" value={bilan.bp} icon={<Target size={14} />} tone="accent"
          sous={bilan.joues ? `${(bilan.bp / bilan.joues).toFixed(1)} par match` : "—"}
          serie={serieButsPour} serieLabel="Buts par match" />
        <Kpi label="Buts encaisses" value={bilan.bc} icon={<ShieldAlert size={14} />} tone="danger"
          sous={bilan.joues ? `${(bilan.bc / bilan.joues).toFixed(1)} par match` : "—"}
          serie={serieButsContre} serieLabel="Buts par match" color="rgb(var(--chart-2))" />
        <Kpi label="Cartons" value={totalCJ + totalCR} icon={<Flag size={14} />} tone="amber"
          sous={`${totalCJ} jaune${totalCJ > 1 ? "s" : ""} · ${totalCR} rouge${totalCR > 1 ? "s" : ""}`} />
      </section>

      {/* ============================================================
          JOUEURS : fatigue a surveiller / buteurs / discipline
          ============================================================ */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TopList
          title="Fatigue" icon={<Flame size={15} />} accent="amber"
          empty={estSaisonActive
            ? "Pas de charge recente connue (matchs ou seances des 4 dernieres semaines)."
            : "La fatigue est un instantane : elle n'existe que sur la saison active."}
          items={topFatigue.map((j: any) => ({
            id: j.id, nom: `${j.prenom ?? ""} ${j.nom}`.trim(),
            poste: j.poste, valeur: j.scoreFatigue ?? 0, valeurLabel: "/100",
          }))}
          max={100}
        />
        <TopList
          title="Buteurs" icon={<Crosshair size={15} />} accent="sky"
          empty={messageButeurs}
          items={topButeurs.map((j: any) => ({
            id: j.id, nom: `${j.prenom ?? ""} ${j.nom}`.trim(),
            poste: j.poste, valeur: j.buts ?? 0, valeurLabel: "buts",
          }))}
          max={maxTop(topButeurs.map((j: any) => ({ valeur: j.buts ?? 0 })))}
        />
        <TopList
          title="Indiscipline" icon={<ShieldAlert size={15} />} accent="danger"
          empty="Pas de carton recu."
          items={topDiscipline.map((j: any) => ({
            id: j.id, nom: `${j.prenom ?? ""} ${j.nom}`.trim(),
            poste: j.poste, valeur: (j.cartonsJaunes ?? 0) + (j.cartonsRouges ?? 0) * 3, valeurLabel: "pts",
          }))}
          max={maxTop(topDiscipline.map((j: any) => ({ valeur: (j.cartonsJaunes ?? 0) + (j.cartonsRouges ?? 0) * 3 })))}
        />
      </section>

      {/* ============================================================
          MINI CLASSEMENT DE LA POULE
          ============================================================ */}
      {tableauPoule.length > 0 && (
        <section className="panel p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <span className="h-section">Classement</span>
              <h2 className="mt-1 font-display text-xl font-bold text-ink">
                {equipe?.competitionLibelle ?? "Championnat"}
                {equipe?.poule ? ` · Poule ${equipe.poule}` : ""}
                <span className="ml-2 text-sm font-normal text-muted">{saisonChoisie?.nom}</span>
              </h2>
            </div>
            <Link href="/classement" className="btn btn-ghost text-xs">
              Tableau complet <ArrowUpRight size={13} />
            </Link>
          </div>

          <table className="table-fm">
            <thead>
              <tr>
                <th>#</th>
                <th>Club</th>
                <th className="text-center">J</th>
                <th className="text-center">V</th>
                <th className="text-center">N</th>
                <th className="text-center">D</th>
                <th className="text-center">+/-</th>
                <th className="text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {tableauPoule.map((l) => (
                <tr key={l.equipeId ?? l.clubId} className={l.equipeId === equipe?.id ? "is-mine" : ""}>
                  <td className="font-display font-bold text-muted">{l.rang}</td>
                  <td>
                    <Link href={`/club/${l.clubId}`} className="flex items-center gap-2.5 transition-colors hover:text-accent">
                      <ClubBadge clubId={l.clubId} size={22} />
                      <span className="font-medium">{clubNom(l.clubId)}</span>
                    </Link>
                  </td>
                  <td className="text-center tabular-nums text-muted">{l.joues}</td>
                  <td className="text-center tabular-nums text-win">{l.v}</td>
                  <td className="text-center tabular-nums text-draw">{l.n}</td>
                  <td className="text-center tabular-nums text-loss">{l.d}</td>
                  <td className="text-center tabular-nums">
                    <span className={diffButs(l) >= 0 ? "text-win" : "text-loss"}>
                      {diffButs(l) > 0 ? "+" : ""}{diffButs(l)}
                    </span>
                  </td>
                  <td className="text-right font-display text-base font-bold tabular-nums text-ink">{l.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   COMPOSANTS INTERNES
   ============================================================ */

/** Repartition victoires / nuls / defaites : une barre en trois segments separes. */
function RepartitionBar({ v, n, d }: { v: number; n: number; d: number }) {
  const total = Math.max(1, v + n + d);
  const seg = (x: number, couleur: string) => x > 0 && (
    <span className="h-full rounded-full" style={{ width: `${(x / total) * 100}%`, background: `rgb(var(--${couleur}))` }} />
  );
  return (
    <div className="w-full">
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-line" role="img"
        aria-label={`${v} victoires, ${n} nuls, ${d} defaites`}>
        {seg(v, "win")}{seg(n, "draw")}{seg(d, "loss")}
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="font-semibold tabular-nums text-win">{v} V</span>
        <span className="font-semibold tabular-nums text-draw">{n} N</span>
        <span className="font-semibold tabular-nums text-loss">{d} D</span>
      </div>
    </div>
  );
}

/** Tuile du hero : un gros chiffre, en degrade pour les deux indicateurs phares. */
function HeroStat({
  label, value, suffix, icon, gradient, showSign, tone,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon?: React.ReactNode;
  gradient?: boolean;
  showSign?: boolean;
  tone?: "win" | "loss";
}) {
  const num = typeof value === "number" ? value : null;
  const couleur = tone === "win" ? "text-win" : tone === "loss" ? "text-loss" : "text-ink";
  return (
    <div className="stat-tile !p-4">
      <div className="flex items-center gap-1.5 text-faint">
        {icon}
        <span className="stat-label">{label}</span>
      </div>
      <div className={`mt-2.5 font-display text-[34px] font-bold leading-none tabular-nums ${gradient ? "text-gradient" : couleur}`}>
        {showSign && num !== null && num > 0 ? "+" : ""}{value}
        {suffix && <span className="ml-1 text-sm font-medium text-faint">{suffix}</span>}
      </div>
    </div>
  );
}

/** Indicateur : icone teintee, chiffre anime, sous-titre et courbe sur les matchs joues. */
function Kpi({
  label, value, icon, tone = "neutral", sous, serie, serieLabel, color,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "danger" | "amber";
  sous?: string;
  serie?: number[];
  serieLabel?: string;
  color?: string;
}) {
  const teinte =
    tone === "accent" ? "bg-accent/12 text-accent"
    : tone === "danger" ? "bg-danger/12 text-danger"
    : tone === "amber" ? "bg-amber/12 text-amber"
    : "bg-panel3 text-muted";
  return (
    <div className="scoreboard !p-5">
      <div className="flex items-center gap-2.5">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${teinte}`}>{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <div className="stat-value !text-[40px]"><CountUp value={value} /></div>
          {sous && <div className="mt-1.5 text-xs text-muted">{sous}</div>}
        </div>
        {serie && serie.length > 1 && (
          <div className="shrink-0 pb-1" title={serieLabel}>
            <Sparkline values={serie} width={84} height={38} color={color} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Classement de joueurs : puce de rang, nom, barre proportionnelle, valeur. */
function TopList({
  title, icon, accent, items, empty, max,
}: {
  title: string;
  icon: React.ReactNode;
  accent: "accent" | "sky" | "amber" | "danger";
  items: { id: string | null; nom: string; poste?: string | null; valeur: number; valeurLabel: string }[];
  empty: string;
  max: number;
}) {
  const texte = accent === "accent" ? "text-accent" : accent === "sky" ? "text-sky" : accent === "amber" ? "text-amber" : "text-danger";
  const fond = accent === "accent" ? "bg-accent" : accent === "sky" ? "bg-sky" : accent === "amber" ? "bg-amber" : "bg-danger";
  const teinte = accent === "accent" ? "bg-accent/12" : accent === "sky" ? "bg-sky/12" : accent === "amber" ? "bg-amber/12" : "bg-danger/12";
  return (
    <div className="panel flex flex-col p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${teinte} ${texte}`}>{icon}</span>
        <span className="font-display text-base font-bold text-ink">{title}</span>
      </div>
      {items.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line2 px-4 py-6 text-center text-xs leading-relaxed text-muted">{empty}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => {
            // Un joueur vu dans les feuilles mais absent de la table des profils n'a pas de fiche.
            const Ligne: any = it.id ? Link : "div";
            return (
              <li key={it.id ?? `${it.nom}-${i}`}>
                <Ligne {...(it.id ? { href: `/joueur/${it.id}` } : {})}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-panel2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${
                    i === 0 ? `${fond} text-white` : "bg-panel3 text-muted"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium text-ink transition-colors group-hover:text-accent">{it.nom}</span>
                      {it.poste && <span className="text-[11px] text-faint">{it.poste}</span>}
                    </span>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-line">
                      <span className={`block h-full rounded-full ${fond}`} style={{ width: `${Math.max(4, (it.valeur / max) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-display text-lg font-bold leading-none tabular-nums ${texte}`}>{it.valeur}</span>
                    <span className="text-[10px] text-faint">{it.valeurLabel}</span>
                  </span>
                </Ligne>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
