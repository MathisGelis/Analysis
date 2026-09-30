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
import { getOwnSaisonIdServer } from "@/lib/own-equipe";
import { ClubBadge } from "@/components/ClubBadge";
import { CountUp } from "@/components/CountUp";
import {
  ArrowRight, ArrowUpRight, Calendar, Crosshair, Flag, Flame,
  ShieldAlert, Target, Trophy, Upload, Users, Zap,
} from "lucide-react";
import type { Issue, Match } from "@/lib/types";

export const metadata = { title: "Dashboard · Foot Analytics" };

function localBilan(joues: { butsMarques: number; butsEncaisses: number }[]) {
  let v = 0, n = 0, d = 0, bp = 0, bc = 0;
  for (const r of joues) {
    bp += r.butsMarques; bc += r.butsEncaisses;
    if (r.butsMarques > r.butsEncaisses) v++;
    else if (r.butsMarques === r.butsEncaisses) n++;
    else d++;
  }
  return { joues: joues.length, v, n, d, bp, bc, pts: 3 * v + n };
}

export default async function Dashboard() {
  const CLUB_PROPRE_ID = getOwnClubIdServer();
  const ownSaisonId = getOwnSaisonIdServer();

  const [clubs, joueurs, classement, matchsAll, saisons] = await Promise.all([
    api.clubs(),
    api.joueurs(CLUB_PROPRE_ID),
    api.classement(),
    api.matchs(CLUB_PROPRE_ID),
    api.saisons(),
  ]);

  // Saison effective : switcher > active > rien.
  const saisonActive = saisons.find((s: any) => s.actif);
  const saisonChoisieId = ownSaisonId ?? saisonActive?.id ?? null;
  const saisonChoisie = saisons.find((s: any) => s.id === saisonChoisieId);

  // Filtres par saison.
  const matchs: Match[] = saisonChoisieId
    ? matchsAll.filter((m: any) => (m.saisonId ?? null) === saisonChoisieId)
    : matchsAll;
  const classementSaison = saisonChoisieId
    ? classement.filter((l: any) => (l.saisonId ?? null) === saisonChoisieId)
    : classement;

  const club = clubs.find((c: any) => c.id === CLUB_PROPRE_ID);
  const clubNom = (id: string) => clubs.find((c: any) => c.id === id)?.nom ?? id;
  const myRank = classementSaison.find((l: any) => l.clubId === CLUB_PROPRE_ID);

  // Resultats ordonnes (= matchs joues, du plus ancien au plus recent).
  type Resultat = {
    matchId: string; journee: string; date: string;
    lieu: "Domicile" | "Exterieur"; advClubId: string;
    butsMarques: number; butsEncaisses: number;
    issue: "V" | "N" | "D";
  };
  const parseDate = (s?: string | null): number => {
    if (!s) return 0;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
    return 0;
  };
  const aVenir: Match[] = [];
  const joues: Resultat[] = [];
  for (const m of matchs) {
    const cnt = (m.scoreDom ?? 0) + (m.scoreExt ?? 0);
    if (m.statut !== "joue" && cnt === 0) {
      aVenir.push(m); continue;
    }
    const dom = m.clubDom === CLUB_PROPRE_ID;
    const bm = dom ? m.scoreDom : m.scoreExt;
    const bc = dom ? m.scoreExt : m.scoreDom;
    joues.push({
      matchId: m.id, journee: m.journee ?? "—", date: m.date ?? "",
      lieu: dom ? "Domicile" : "Exterieur",
      advClubId: dom ? m.clubExt : m.clubDom,
      butsMarques: bm, butsEncaisses: bc,
      issue: bm > bc ? "V" : bm === bc ? "N" : "D",
    });
  }
  joues.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  aVenir.sort((a, b) => parseDate(a.date ?? "") - parseDate(b.date ?? ""));

  const bilan = localBilan(joues);
  // Diff. de buts : ligne de classement si presente, sinon calcul local.
  const diffButs = myRank ? myRank.bp - myRank.bc : bilan.bp - bilan.bc;
  const dernier = joues[joues.length - 1];
  const prochain = aVenir[0];
  const formeRecente: Issue[] = joues.slice(-10).map((r) => r.issue);

  // Joueurs : tops
  const actifs = joueurs.filter((j: any) => (j.matchs ?? 0) >= 3);
  const topForme = [...actifs]
    .sort((a: any, b: any) => (b.scoreForme ?? 0) - (a.scoreForme ?? 0))
    .slice(0, 5);
  const topButeurs = [...joueurs]
    .filter((j: any) => (j.butsMarques ?? j.buts ?? 0) > 0)
    .sort((a: any, b: any) => (b.butsMarques ?? b.buts ?? 0) - (a.butsMarques ?? a.buts ?? 0))
    .slice(0, 5);
  const topDiscipline = [...joueurs]
    .filter((j: any) => (j.cartonsJaunes ?? 0) + (j.cartonsRouges ?? 0) > 0)
    .sort((a: any, b: any) =>
      (b.cartonsJaunes + b.cartonsRouges * 3) - (a.cartonsJaunes + a.cartonsRouges * 3))
    .slice(0, 5);

  // Mini classement : 5 lignes autour de mon rang.
  const monRang = myRank?.rang ?? 0;
  const tableauPoule = monRang > 0
    ? classementSaison.slice(
        Math.max(0, monRang - 3),
        Math.min(classementSaison.length, monRang + 2),
      )
    : classementSaison.slice(0, 5);

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
            <ClubBadge clubId={CLUB_PROPRE_ID} size={72} />
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
              <Link href={`/club/${CLUB_PROPRE_ID}`}
                    className="font-display text-3xl font-bold text-ink leading-tight tracking-tight hover:text-turf transition-colors mt-1 block">
                {club?.nom ?? "Club non defini"}
              </Link>
              {club?.ville && (
                <div className="text-xs text-muted mt-0.5">{club.ville}</div>
              )}
            </div>
          </div>

          {/* Bilan ligne */}
          <div className="col-span-12 lg:col-span-7 grid grid-cols-4 gap-3">
            <HeroStat label="Rang" value={myRank?.rang ?? "—"}
              suffix={myRank ? `/ ${classementSaison.length}` : undefined}
              accent="turf" icon={<Trophy size={14}/>}/>
            <HeroStat label="Points" value={myRank?.pts ?? bilan.pts} accent="turf"/>
            <HeroStat label="Diff. buts" value={diffButs}
              accent={diffButs >= 0 ? "turf" : "danger"}
              showSign/>
            <HeroStat label="Joues" value={bilan.joues} icon={<Calendar size={14}/>}/>
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
          value={joueurs.reduce((s: number, j: any) => s + (j.cartonsJaunes ?? 0) + (j.cartonsRouges ?? 0), 0)}
          icon={<Flag size={14}/>}
          tone="amber"
          subtitle={`${joueurs.reduce((s: number, j: any) => s + (j.cartonsRouges ?? 0), 0)} rouges`}
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
                const dom = prochain.clubDom === CLUB_PROPRE_ID;
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
                      <ClubBadge clubId={CLUB_PROPRE_ID} size={48}/>
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
          empty="Pas encore assez de matchs joues."
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
          empty="Pas de but inscrit cette saison."
          items={topButeurs.map((j: any) => ({
            id: j.id, nom: `${j.prenom ?? ""} ${j.nom}`.trim(),
            poste: j.poste,
            valeur: j.butsMarques ?? j.buts ?? 0,
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
                {saisonChoisie?.nom ?? "Saison courante"}
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
              {tableauPoule.map((l: any) => (
                <tr key={l.clubId} className={l.clubId === CLUB_PROPRE_ID ? "is-mine" : ""}>
                  <td className="font-mono text-muted">{l.rang}</td>
                  <td>
                    <Link href={`/club/${l.clubId}`} className="flex items-center gap-2 hover:text-turf transition-colors">
                      <ClubBadge clubId={l.clubId} size={20}/>
                      <span className="font-medium">{clubNom(l.clubId)}</span>
                    </Link>
                  </td>
                  <td className="text-center tabular-nums text-muted">{l.joues}</td>
                  <td className="text-center tabular-nums text-win">{l.victoires}</td>
                  <td className="text-center tabular-nums text-draw">{l.nuls}</td>
                  <td className="text-center tabular-nums text-loss">{l.defaites}</td>
                  <td className="text-center tabular-nums">
                    <span className={l.diffButs >= 0 ? "text-turf" : "text-danger"}>
                      {l.diffButs > 0 ? "+" : ""}{l.diffButs}
                    </span>
                  </td>
                  <td className="text-right font-display font-bold text-ink tabular-nums">
                    {l.points}
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
  items: { id: string; nom: string; poste?: string | null; valeur: number; valeurLabel: string }[];
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
            <li key={it.id}>
              <Link href={`/joueur/${it.id}`}
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
