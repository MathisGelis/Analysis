// src/app/page.tsx
//
// Dashboard — vibe Football Manager + console d'entraineur.
//
// Composition :
//  - Hero : Mon club + saison + bilan condensé (V/N/D, points, rang)
//  - 4 scoreboards : Matchs, Buts marques, Buts encaisses, Discipline
//  - Forme : frise des 10 derniers resultats + KPI bilan
//  - Prochain match : carte panel
//  - Top forme + Top discipline (deux colonnes)
//  - Mini classement de la poule (5 lignes autour de mon rang)
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
import {
  ArrowRight, ArrowUpRight, Calendar, Crosshair, Flag, Flame,
  ShieldAlert, Target, Trophy, Upload,
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

  // Joueurs : tops. L'indice de forme est un instantane du moment present :
  // il n'a de sens que sur la saison active (cf. effectif()).
  const actifs = effectif.filter((j) => (j.matchs ?? 0) >= 3);
  const topForme = estSaisonActive
    ? [...actifs].filter((j) => j.scoreForme != null)
        .sort((a, b) => (b.scoreForme ?? 0) - (a.scoreForme ?? 0)).slice(0, 5)
    : [];
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

  return (
    <div className="space-y-6 fade-up-stagger max-w-[1400px]">

      {/* ============================================================
          HERO — Mon club, saison, indicateurs principaux
          ============================================================ */}
      <header className="panel relative overflow-hidden">
        {/* Halo turf subtil en arriere-plan */}
        <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full pointer-events-none"
             style={{ background: "radial-gradient(closest-side, rgb(var(--turf) / .12), transparent)" }}/>

        <div className="relative p-7 grid grid-cols-12 gap-6 items-center">

          {/* Identite club */}
          <div className="col-span-12 lg:col-span-5 flex items-center gap-4">
            <ClubBadge clubId={clubPropreId} size={72} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="h-section">Mon club</span>
                {saisonChoisie && (
                  <span className={`badge ${saisonChoisie.actif ? "badge-turf" : ""}`}>
                    {saisonChoisie.actif && <span className="w-1.5 h-1.5 rounded-full bg-turf pulse-live"/>}
                    {saisonChoisie.nom}
                  </span>
                )}
              </div>
              <Link href={`/club/${clubPropreId}`}
                    className="font-display text-3xl font-bold text-ink leading-tight tracking-tight hover:text-turf transition-colors mt-1 block">
                {club?.nom ?? "Club non defini"}
              </Link>
              {equipe ? (
                <div className="text-xs text-muted mt-0.5">
                  {equipe.nom}
                  {equipe.competitionLibelle ? ` · ${equipe.competitionLibelle}` : ""}
                  {equipe.poule ? ` · Poule ${equipe.poule}` : ""}
                </div>
              ) : (
                <div className="text-xs text-amber mt-0.5">
                  Aucune equipe sur cette saison : choisis-en une dans le selecteur en bas a gauche.
                </div>
              )}
            </div>
          </div>

          {/* Bilan ligne */}
          <div className="col-span-12 lg:col-span-7 grid grid-cols-4 gap-3">
            <HeroStat label="Rang" value={maLigne?.rang ?? "—"}
              suffix={maLigne ? `/ ${lignes.length}` : undefined}
              accent="turf" icon={<Trophy size={14}/>}/>
            <HeroStat label="Points" value={maLigne?.pts ?? bilan.pts} accent="turf"/>
            <HeroStat label="Diff. buts" value={diff}
              accent={diff >= 0 ? "turf" : "danger"}
              showSign/>
            <HeroStat label="Joues" value={maLigne?.joues ?? bilan.joues} icon={<Calendar size={14}/>}/>
          </div>
        </div>

        {/* Strip de forme : 10 derniers resultats. Bordure top discrete. */}
        {formeRecente.length > 0 && (
          <div className="border-t border-line px-7 py-4 flex items-center gap-3 flex-wrap">
            <span className="h-section">Forme · 10 derniers</span>
            <div className="flex items-center gap-1">
              {formeRecente.map((r, i) => (
                <span key={i} className={r === "V" ? "pill-v" : r === "N" ? "pill-n" : "pill-d"}>
                  {r}
                </span>
              ))}
            </div>
            <span className="text-xs text-muted ml-auto">
              <span className="text-win font-semibold tabular-nums">{bilan.v}V</span>
              <span className="mx-1.5">·</span>
              <span className="text-draw font-semibold tabular-nums">{bilan.n}N</span>
              <span className="mx-1.5">·</span>
              <span className="text-loss font-semibold tabular-nums">{bilan.d}D</span>
            </span>
          </div>
        )}
      </header>

      {/* ============================================================
          SCOREBOARDS — 4 KPI principaux
          ============================================================ */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Scoreboard
          label="Matchs joues"
          value={bilan.joues}
          icon={<Calendar size={14}/>}
          tone="neutral"
        />
        <Scoreboard
          label="Buts marques"
          value={bilan.bp}
          icon={<Target size={14}/>}
          tone="turf"
          subtitle={bilan.joues ? `${(bilan.bp / bilan.joues).toFixed(1)} / match` : "—"}
        />
        <Scoreboard
          label="Buts encaisses"
          value={bilan.bc}
          icon={<ShieldAlert size={14}/>}
          tone="danger"
          subtitle={bilan.joues ? `${(bilan.bc / bilan.joues).toFixed(1)} / match` : "—"}
        />
        <Scoreboard
          label="Cartons"
          value={totalCJ + totalCR}
          icon={<Flag size={14}/>}
          tone="amber"
          subtitle={`${totalCR} rouge${totalCR > 1 ? "s" : ""}`}
        />
      </section>

      {/* ============================================================
          PROCHAIN MATCH + DERNIER RESULTAT
          ============================================================ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Prochain match : 2 col */}
        <div className="lg:col-span-2 panel p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="h-section">Prochaine echeance</span>
              <h3 className="font-display text-xl font-bold text-ink mt-1">
                {prochain ? `Journee ${prochain.journee ?? "—"}` : "Aucun match a venir"}
              </h3>
            </div>
            {prochain && (
              <Link href={`/matchs/${prochain.id}`} className="btn btn-ghost text-xs">
                Voir <ArrowRight size={12}/>
              </Link>
            )}
          </div>

          {prochain ? (
            <div className="grid grid-cols-12 items-center gap-3">
              {/* Equipe 1 (toujours mon club a gauche pour la lisibilite) */}
              {(() => {
                const dom = prochain.equipeDomId === equipe?.id;
                const advId = dom ? prochain.clubExt : prochain.clubDom;
                return (
                  <>
                    <div className="col-span-5 flex items-center gap-3 justify-end text-right">
                      <div>
                        <div className="font-display font-bold text-ink">{club?.nom ?? "Mon club"}</div>
                        <div className="text-[10px] uppercase tracking-wider text-faint mt-0.5">
                          {dom ? "Domicile" : "Exterieur"}
                        </div>
                      </div>
                      <ClubBadge clubId={clubPropreId} size={48}/>
                    </div>

                    {/* VS au milieu */}
                    <div className="col-span-2 text-center">
                      <div className="font-mono text-faint text-xs">VS</div>
                      {prochain.date && (
                        <div className="text-[10px] uppercase tracking-wider text-muted mt-1 font-semibold">
                          {prochain.date}
                        </div>
                      )}
                    </div>

                    {/* Equipe 2 */}
                    <div className="col-span-5 flex items-center gap-3">
                      <ClubBadge clubId={advId} size={48}/>
                      <div>
                        <div className="font-display font-bold text-ink">{clubNom(advId)}</div>
                        <div className="text-[10px] uppercase tracking-wider text-faint mt-0.5">
                          {dom ? "Visiteur" : "Recoit"}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="text-sm text-muted py-6 text-center">
              Pas de match programme dans la base.
              <br/>
              <Link href="/import" className="link-discrete text-turf underline mt-2 inline-block">
                <Upload size={12} className="inline mr-1"/> Importer une feuille FMI
              </Link>
            </div>
          )}
        </div>

        {/* Dernier resultat */}
        <div className="panel p-6">
          <span className="h-section">Dernier match</span>
          {dernier ? (
            <>
              <div className="flex items-center gap-3 mt-3">
                <ClubBadge clubId={dernier.advClubId} size={40}/>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{dernier.lieu}</div>
                  <div className="font-display font-bold text-ink truncate">
                    {clubNom(dernier.advClubId)}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-end gap-2">
                <div className="font-display text-4xl font-bold leading-none text-ink tabular-nums">
                  {dernier.butsMarques}-{dernier.butsEncaisses}
                </div>
                <span className={`pill-${dernier.issue.toLowerCase() as "v" | "n" | "d"} ml-auto`}>
                  {dernier.issue}
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-faint mt-2">
                J{dernier.journee.replace(/\D/g, "")} · {dernier.date}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted py-6">Aucun match joue.</div>
          )}
        </div>
      </section>

      {/* ============================================================
          JOUEURS : tops forme / buteurs / discipline
          ============================================================ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Top forme */}
        <TopList
          title="Forme"
          icon={<Flame size={14}/>}
          accent="turf"
          empty={estSaisonActive
            ? "Pas encore assez de matchs joues."
            : "L'indice de forme est un instantane : il n'existe que sur la saison active."}
          items={topForme.map((j: any) => ({
            id: j.id, nom: `${j.prenom ?? ""} ${j.nom}`.trim(),
            poste: j.poste, valeur: j.scoreForme ?? 0,
            valeurLabel: "/100",
          }))}
        />

        {/* Top buteurs */}
        <TopList
          title="Buteurs"
          icon={<Crosshair size={14}/>}
          accent="sky"
          empty={messageButeurs}
          items={topButeurs.map((j: any) => ({
            id: j.id, nom: `${j.prenom ?? ""} ${j.nom}`.trim(),
            poste: j.poste,
            valeur: j.buts ?? 0,
            valeurLabel: "buts",
          }))}
        />

        {/* Top discipline */}
        <TopList
          title="Indiscipline"
          icon={<ShieldAlert size={14}/>}
          accent="danger"
          empty="Pas de carton recu."
          items={topDiscipline.map((j: any) => ({
            id: j.id, nom: `${j.prenom ?? ""} ${j.nom}`.trim(),
            poste: j.poste,
            valeur: (j.cartonsJaunes ?? 0) + (j.cartonsRouges ?? 0) * 3,
            valeurLabel: "pts",
          }))}
        />
      </section>

      {/* ============================================================
          MINI CLASSEMENT DE LA POULE
          ============================================================ */}
      {tableauPoule.length > 0 && (
        <section className="panel p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="h-section">Classement</span>
              <h3 className="font-display text-xl font-bold text-ink mt-1">
                {equipe?.competitionLibelle ?? "Championnat"}
                {equipe?.poule ? ` · Poule ${equipe.poule}` : ""}
                <span className="text-muted font-normal text-sm ml-2">{saisonChoisie?.nom}</span>
              </h3>
            </div>
            <Link href="/classement" className="btn btn-ghost text-xs">
              Tableau complet <ArrowUpRight size={12}/>
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
                  <td className="font-mono text-muted">{l.rang}</td>
                  <td>
                    <Link href={`/club/${l.clubId}`} className="flex items-center gap-2 hover:text-turf transition-colors">
                      <ClubBadge clubId={l.clubId} size={20}/>
                      <span className="font-medium">{clubNom(l.clubId)}</span>
                    </Link>
                  </td>
                  <td className="text-center tabular-nums text-muted">{l.joues}</td>
                  <td className="text-center tabular-nums text-win">{l.v}</td>
                  <td className="text-center tabular-nums text-draw">{l.n}</td>
                  <td className="text-center tabular-nums text-loss">{l.d}</td>
                  <td className="text-center tabular-nums">
                    <span className={diffButs(l) >= 0 ? "text-turf" : "text-danger"}>
                      {diffButs(l) > 0 ? "+" : ""}{diffButs(l)}
                    </span>
                  </td>
                  <td className="text-right font-display font-bold text-ink tabular-nums">
                    {l.pts}
                  </td>
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

/** Stat condensee du hero. Pas de count-up (server component). */
function HeroStat({
  label, value, suffix, accent, icon, showSign,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  accent?: "turf" | "danger";
  icon?: React.ReactNode;
  showSign?: boolean;
}) {
  const valueClass =
    accent === "turf" ? "text-turf"
    : accent === "danger" ? "text-danger"
    : "text-ink";
  const num = typeof value === "number" ? value : null;
  return (
    <div className="panel-inset p-3.5">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-faint">{icon}</span>}
        <span className="h-section text-[9px]">{label}</span>
      </div>
      <div className={`font-display text-2xl font-bold leading-none tracking-tight mt-2 ${valueClass} tabular-nums`}>
        {showSign && num !== null && num > 0 ? "+" : ""}{value}
        {suffix && <span className="text-xs text-faint font-medium ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

/** Scoreboard : KPI avec animation count-up, separateur vertical fin
 *  entre label et valeur (signature "afficheur de stade"). */
function Scoreboard({
  label, value, icon, tone = "neutral", subtitle,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "neutral" | "turf" | "danger" | "amber" | "sky";
  subtitle?: string;
}) {
  const toneClass =
    tone === "turf"   ? "text-turf"
    : tone === "danger" ? "text-danger"
    : tone === "amber"  ? "text-amber"
    : tone === "sky"    ? "text-sky"
    : "text-ink";
  return (
    <div className="scoreboard">
      <div className="flex items-center gap-2 text-faint">
        {icon}
        <span className="stat-label">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        {/* Separateur vertical : signature visuelle "afficheur stade" */}
        <span className="block w-[2px] h-7 bg-line"/>
        <span className={`stat-value ${toneClass}`}>
          <CountUp value={value}/>
        </span>
      </div>
      {subtitle && (
        <div className="text-[11px] text-muted mt-1">{subtitle}</div>
      )}
    </div>
  );
}

/** Liste top X joueurs, vibe Excel propre. */
function TopList({
  title, icon, accent, items, empty,
}: {
  title: string;
  icon: React.ReactNode;
  accent: "turf" | "sky" | "danger";
  items: { id: string | null; nom: string; poste?: string | null; valeur: number; valeurLabel: string }[];
  empty: string;
}) {
  const accentText =
    accent === "turf" ? "text-turf"
    : accent === "sky" ? "text-sky"
    : "text-danger";
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={accentText}>{icon}</span>
        <span className="h-section">{title}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-faint py-4">{empty}</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={it.id ?? `${it.nom}-${i}`}>
              {/* Un joueur vu dans les feuilles mais absent de la table des profils n'a pas de fiche. */}
              {(() => {
                const Ligne: any = it.id ? Link : "div";
                return (
              <Ligne {...(it.id ? { href: `/joueur/${it.id}` } : {})}
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-line/30 transition-colors group">
                <span className="font-mono text-[11px] text-faint w-4">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <div className="font-medium text-ink truncate group-hover:text-turf transition-colors">
                    {it.nom}
                  </div>
                  {it.poste && (
                    <div className="text-[10px] text-faint uppercase tracking-wider">{it.poste}</div>
                  )}
                </span>
                <span className="text-right">
                  <div className={`font-display font-bold text-lg leading-none ${accentText} tabular-nums`}>
                    {it.valeur}
                  </div>
                  <div className="text-[9px] text-faint uppercase tracking-wider">{it.valeurLabel}</div>
                </span>
              </Ligne>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
