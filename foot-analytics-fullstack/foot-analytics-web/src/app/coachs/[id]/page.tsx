// src/app/coachs/[id]/page.tsx
//
// Fiche d'un entraineur (ou membre du staff) : son bilan sur les matchs ou il etait sur le banc, par
// saison et par club, son parcours de clubs et ses matchs. Comme la fiche arbitre, elle suit la saison
// choisie dans le selecteur par defaut (?portee=saison) ; ?portee=carriere montre tout l'historique.
// Les bilans par saison et le parcours couvrent toujours toute la carriere.

import { notFound } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { parsePortee } from "@/lib/arbitre-portee";
import { decimal } from "@/lib/tendances-format";
import { ClubBadge } from "@/components/ClubBadge";
import { ClubNom } from "@/components/ClubNom";
import { ArrowLeft, ArrowRight, Shield, Users } from "lucide-react";

export const metadata = { title: "Entraineur · Foot Analytics" };

export default async function CoachDetail({
  params, searchParams,
}: { params: { id: string }; searchParams?: { portee?: string | string[] } }) {
  const portee = parsePortee(searchParams?.portee);
  const [equipes, saisons, matchs] = await Promise.all([api.equipes(), api.saisons(), api.matchs()]);
  const { saison } = await resolveEquipePropre({ equipes, saisons, matchs });
  const fiche = await api.ficheCoach(params.id, portee === "saison" ? saison?.id ?? null : null);
  if (!fiche) notFound();

  const { coach, bilan } = fiche;
  const nomComplet = [coach.prenom, coach.nom].filter(Boolean).join(" ");
  const carriere = fiche.parSaison.reduce((s, l) => s + l.bilan.matchs, 0);
  const href = (p: "saison" | "carriere") => `/coachs/${params.id}${p === "carriere" ? "?portee=carriere" : ""}`;

  return (
    <div className="space-y-6 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={fiche.clubActuelId ? `/rapports/equipe/${fiche.clubActuelId}` : "/rapports"} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft size={12} /> Retour au rapport d'equipe
        </Link>
        <nav className="flex gap-1 text-xs" aria-label="Portee de la fiche">
          <Link href={href("saison")} scroll={false} className={`btn ${portee === "saison" ? "btn-accent" : "btn-ghost"}`}>
            Saison {saison?.nom ?? "courante"}
          </Link>
          <Link href={href("carriere")} scroll={false} className={`btn ${portee === "carriere" ? "btn-accent" : "btn-ghost"}`}>
            Carriere complete
          </Link>
        </nav>
      </div>

      <header className="panel grid grid-cols-12 gap-5 p-6">
        <div className="col-span-12 flex items-center gap-4 lg:col-span-5">
          {fiche.clubActuelId
            ? <ClubBadge clubId={fiche.clubActuelId} size={64} />
            : <div className="grid h-16 w-16 place-items-center rounded-2xl border border-line bg-panel2"><Users size={24} className="text-accent" aria-hidden /></div>}
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-faint">{fiche.fonctionPrincipale ?? "Staff"}</div>
            <h1 className="font-display text-3xl font-bold leading-tight text-ink">{nomComplet}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {fiche.clubActuelId && (
                <Link href={`/club/${fiche.clubActuelId}`} className="badge hover:border-accent/40 hover:text-accent">
                  <Shield size={11} aria-hidden /> <ClubNom clubId={fiche.clubActuelId} />
                </Link>
              )}
              {coach.licence && <span className="badge">Licence {coach.licence}</span>}
              {fiche.fonctions.map((f) => <span key={f.code} className="badge" title={`${f.matchs} match${f.matchs > 1 ? "s" : ""}`}>{f.libelle}</span>)}
            </div>
          </div>
        </div>
        <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          <Tuile label="Matchs" valeur={String(bilan.matchs)} note={portee === "saison" ? `${carriere} en carriere` : "en carriere"} />
          <Tuile label="V - N - D" valeur={<><span className="text-win">{bilan.v}</span><span className="text-faint"> - </span><span className="text-draw">{bilan.n}</span><span className="text-faint"> - </span><span className="text-loss">{bilan.d}</span></>} note={`${bilan.pctV} % de victoires`} />
          <Tuile label="Points / match" valeur={bilan.matchs ? decimal(bilan.ppm, 2) : "—"} note={`${bilan.pts} points`} />
          <Tuile label="Buts" valeur={`${bilan.bp} - ${bilan.bc}`} note="marques - encaisses" />
        </div>
      </header>

      {bilan.matchs === 0 && (
        <section className="panel p-5 text-sm text-muted">
          Aucun match de {nomComplet} sur {portee === "saison" ? <>la saison {saison?.nom ?? "courante"}. <Link href={href("carriere")} className="text-accent hover:underline">Voir la carriere complete</Link></> : "la base."}
        </section>
      )}

      {/* Bilan par saison et par club : toute la carriere */}
      {fiche.parSaison.length > 0 && (
        <section className="panel p-5" aria-labelledby="par-saison">
          <h2 id="par-saison" className="h-section mb-3">Saison par saison</h2>
          <div className="overflow-x-auto">
            <table className="table-fm w-full min-w-[560px]">
              <thead>
                <tr>
                  <th>Saison</th><th>Club</th>
                  <th className="text-right">Matchs</th><th className="text-right">V-N-D</th>
                  <th className="text-right">Pts / match</th><th className="text-right">% V</th><th className="text-right">Buts</th>
                </tr>
              </thead>
              <tbody>
                {fiche.parSaison.map((l) => (
                  <tr key={`${l.saisonId}-${l.clubId}`}>
                    <td className="font-semibold">{l.saisonNom ?? "—"}</td>
                    <td><Link href={`/club/${l.clubId}`} className="flex items-center gap-2 hover:text-accent"><ClubBadge clubId={l.clubId} size={20} /><ClubNom clubId={l.clubId} /></Link></td>
                    <td className="text-right tabular-nums">{l.bilan.matchs}</td>
                    <td className="text-right tabular-nums"><span className="text-win">{l.bilan.v}</span>-<span className="text-draw">{l.bilan.n}</span>-<span className="text-loss">{l.bilan.d}</span></td>
                    <td className="text-right tabular-nums">{decimal(l.bilan.ppm, 2)}</td>
                    <td className="text-right tabular-nums">{l.bilan.pctV} %</td>
                    <td className="text-right tabular-nums text-muted">{l.bilan.bp}-{l.bilan.bc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Parcours de clubs */}
        {fiche.parcours.length > 0 && (
          <section className="panel p-5 lg:col-span-5" aria-labelledby="parcours">
            <h2 id="parcours" className="h-section mb-3">Parcours</h2>
            <ol className="space-y-2">
              {fiche.parcours.map((p, i) => (
                <li key={p.clubId} className="panel-inset flex items-center gap-3 px-3 py-2.5">
                  <ClubBadge clubId={p.clubId} size={28} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/club/${p.clubId}`} className="block truncate text-sm font-semibold text-ink hover:text-accent"><ClubNom clubId={p.clubId} /></Link>
                    <div className="text-[11px] text-muted">
                      {p.matchs} match{p.matchs > 1 ? "s" : ""}
                      {p.premierMatch && p.dernierMatch && (p.premierMatch === p.dernierMatch ? ` · ${p.premierMatch}` : ` · ${p.premierMatch} → ${p.dernierMatch}`)}
                    </div>
                  </div>
                  {i === 0 && <span className="badge badge-accent text-[10px]">Actuel</span>}
                </li>
              ))}
            </ol>
            {(coach.cartonsJaunes > 0 || coach.cartonsRouges > 0) && (
              <p className="mt-4 text-xs text-muted">
                Cartons recus sur le banc : <b className="text-amber">{coach.cartonsJaunes}</b> jaune{coach.cartonsJaunes > 1 ? "s" : ""}, <b className="text-danger">{coach.cartonsRouges}</b> rouge{coach.cartonsRouges > 1 ? "s" : ""}
                {coach.motifsTop ? ` · ${coach.motifsTop}` : ""}.
              </p>
            )}
          </section>
        )}

        {/* Matchs de la portee */}
        {fiche.matchs.length > 0 && (
          <section className="panel p-5 lg:col-span-7" aria-labelledby="matchs-coach">
            <h2 id="matchs-coach" className="h-section mb-3">Matchs <span className="font-normal normal-case tracking-normal text-faint">{portee === "saison" ? `saison ${saison?.nom ?? ""}` : "carriere"}</span></h2>
            <ul className="divide-y divide-line">
              {fiche.matchs.map((m) => (
                <li key={m.matchId}>
                  <Link href={`/matchs/${m.matchId}`} className="flex items-center gap-3 py-2 text-sm hover:bg-line/30">
                    <span className={`pill-${m.issue.toLowerCase() as "v" | "n" | "d"}`}>{m.issue}</span>
                    <span className="w-16 shrink-0 text-xs tabular-nums text-faint">{m.date ?? "—"}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{m.domicile ? "vs" : "@"} <ClubNom clubId={m.adversaireId} /></span>
                    <span className="font-semibold tabular-nums text-ink">{m.bp}-{m.bc}</span>
                    <ArrowRight size={12} className="text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Tuile({ label, valeur, note }: { label: string; valeur: React.ReactNode; note: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="mt-1.5 whitespace-nowrap font-display text-xl font-bold tabular-nums text-ink">{valeur}</div>
      <div className="mt-1 text-[11px] text-muted">{note}</div>
    </div>
  );
}
