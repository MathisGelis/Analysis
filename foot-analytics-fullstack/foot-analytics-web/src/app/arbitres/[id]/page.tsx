// src/app/arbitres/[id]/page.tsx
//
// Fiche arbitre : KPIs derives + historique de ses matchs (avec la note
// donnee par mon club s'il y en a une).
//
// SAISON-SENSITIVE : par defaut (?portee=saison) tout est restreint a la
// saison choisie dans le switcher ; ?portee=carriere affiche l'historique
// complet. Le toggle est un simple lien, la page reste un Server Component.

import { notFound } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { ClubBadge } from "@/components/ClubBadge";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import {
  liensDeSaison, parsePortee, participationsDeSaison, totauxDepuis,
} from "@/lib/arbitre-portee";
import { ArrowLeft, AlertTriangle, Award, Star } from "lucide-react";

const ROLE_LIBELLE: Record<string, string> = {
  principal: "Principal",
  assistant1: "Assistant 1",
  assistant2: "Assistant 2",
  "4e": "4e officiel",
  autre: "Autre",
};

export default async function ArbitreDetail({
  params, searchParams,
}: {
  params: { id: string };
  searchParams?: { portee?: string | string[] };
}) {
  const [arb, clubs, matchs, equipes, saisons] = await Promise.all([
    api.arbitre(params.id),
    api.clubs(),
    api.matchs(),
    api.equipes(),
    api.saisons(),
  ]);
  if (!arb) notFound();

  const portee = parsePortee(searchParams?.portee);
  const { saison } = await resolveEquipePropre({ equipes, saisons, matchs });
  const saisonId = saison?.id ?? null;

  // arb.liensMatchs: ArbitreMatch[] avec leur match (relation TypeORM).
  // arb.participations: stats DECOMPOSEES par championnat (saison +
  // competition + poule) — sert a la frise comparative entre saisons.
  const matchById = new Map<string, any>(matchs.map((m: any) => [m.id, m]));
  const liensComplets: any[] = (arb.liensMatchs ?? []).map((p: any) => ({
    ...p,
    matchData: matchById.get(p.matchId) ?? p.match,
  }));
  const liensMatchs: any[] = (portee === "saison"
    ? liensDeSaison(liensComplets, saisonId)
    : liensComplets
  ).sort((a: any, b: any) => {
    const ja = parseInt((a.matchData?.journee ?? "").replace(/[^0-9]/g, ""), 10) || 0;
    const jb = parseInt((b.matchData?.journee ?? "").replace(/[^0-9]/g, ""), 10) || 0;
    return jb - ja;
  });
  const participations: any[] = arb.participations ?? [];
  const parChampionnat: any[] = portee === "saison"
    ? participationsDeSaison(participations, saisonId)
    : participations;
  // Totaux : sur la saison, recalcules depuis les participations filtrees ;
  // sur la carriere, ce sont les cumuls stockes sur l'arbitre.
  const totaux = portee === "saison"
    ? totauxDepuis(parChampionnat, liensMatchs)
    : {
        matchsOfficies: arb.matchsOfficies,
        cartonsJaunesDonnes: arb.cartonsJaunesDonnes,
        cartonsRougesDonnes: arb.cartonsRougesDonnes,
        noteMoyenne: arb.noteMoyenne ?? null,
        profil: arb.profil ?? null,
        motifsTop: arb.motifsTop ?? null,
      };
  const hrefPortee = (p: "saison" | "carriere") =>
    `/arbitres/${params.id}${p === "carriere" ? "?portee=carriere" : ""}`;

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/arbitres" className="text-xs text-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft size={12}/> Retour arbitres
        </Link>
        <nav className="flex gap-1 text-xs" aria-label="Portee de la fiche">
          <Link href={hrefPortee("saison")} scroll={false}
            className={`btn ${portee === "saison" ? "btn-turf" : "btn-ghost"}`}>
            Saison {saison?.nom ?? "courante"}
          </Link>
          <Link href={hrefPortee("carriere")} scroll={false}
            className={`btn ${portee === "carriere" ? "btn-turf" : "btn-ghost"}`}>
            Carriere complete
          </Link>
        </nav>
      </div>

      <header className="panel p-6 grid grid-cols-12 gap-5">
        <div className="col-span-12 md:col-span-7 flex items-center gap-4">
          <div className="w-20 h-20 rounded-md bg-panel2 border border-line grid place-items-center">
            <Award size={28} className="text-turf"/>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-faint">Arbitre</div>
            <h1 className="font-display text-3xl font-bold text-ink leading-tight">
              {arb.prenom ? <span className="text-muted font-light">{arb.prenom} </span> : null}
              {arb.nom}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {totaux.profil ? (
                <span className={`badge ${
                  totaux.profil === "Strict" ? "badge-danger"
                  : totaux.profil === "Permissif" ? "badge-turf" : "badge-amber"
                }`}>Profil {totaux.profil}</span>
              ) : null}
              <span className="badge">{totaux.matchsOfficies} match{totaux.matchsOfficies > 1 ? "s" : ""} officie{totaux.matchsOfficies > 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-5 grid grid-cols-3 gap-3">
          <Card label="CJ donnes" value={totaux.cartonsJaunesDonnes} color="text-amber"/>
          <Card label="CR donnes" value={totaux.cartonsRougesDonnes} color="text-danger"/>
          <Card label="Note moy." value={totaux.noteMoyenne != null ? totaux.noteMoyenne.toFixed(1) : "—"} color="text-turf"/>
        </div>
      </header>

      {portee === "saison" && parChampionnat.length === 0 && liensMatchs.length === 0 && (
        <section className="panel p-5 text-sm text-muted">
          Cet arbitre n'a officie dans aucun match de la saison{" "}
          {saison?.nom ?? "selectionnee"}.{" "}
          <Link href={hrefPortee("carriere")} className="text-turf hover:underline">
            Voir la carriere complete
          </Link>
        </section>
      )}

      {totaux.motifsTop && (
        <section className="panel p-5">
          <div className="h-section mb-2 flex items-center gap-2">
            <AlertTriangle size={11} className="text-amber"/>
            Motifs de cartons les plus frequents
          </div>
          <p className="text-sm text-ink">{totaux.motifsTop}</p>
          <p className="text-[11px] text-faint mt-1">
            Calcule uniquement sur les matchs ou il etait arbitre principal.
          </p>
        </section>
      )}

      {parChampionnat.length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <Award size={11} className="text-turf"/>
            Profil par championnat ({parChampionnat.length})
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {parChampionnat.map((c: any, i: number) => (
              <li key={i} className="panel-inset p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-display font-bold text-ink text-sm">
                      {c.saisonNom ?? "Saison inconnue"}
                    </div>
                    <div className="text-[10px] text-faint">
                      {c.competitionLibelle ?? "?"}
                      {c.poule ? ` · Poule ${c.poule}` : ""}
                    </div>
                  </div>
                  {c.profil ? (
                    <span className={`badge ${
                      c.profil === "Strict" ? "badge-danger"
                      : c.profil === "Permissif" ? "badge-turf" : "badge-amber"
                    }`}>{c.profil}</span>
                  ) : <span className="badge opacity-60">Sans profil</span>}
                </div>
                <div className="grid grid-cols-4 gap-1 text-center">
                  <div>
                    <div className="font-semibold text-ink tabular-nums text-sm">{c.matchsOfficies}</div>
                    <div className="text-[9px] text-faint uppercase">officies</div>
                  </div>
                  <div>
                    <div className="font-semibold text-ink tabular-nums text-sm">{c.matchsPrincipal}</div>
                    <div className="text-[9px] text-faint uppercase">principal</div>
                  </div>
                  <div>
                    <div className="font-semibold text-amber tabular-nums text-sm">{c.cartonsJaunesDonnes}</div>
                    <div className="text-[9px] text-faint uppercase">CJ</div>
                  </div>
                  <div>
                    <div className="font-semibold text-danger tabular-nums text-sm">{c.cartonsRougesDonnes}</div>
                    <div className="text-[9px] text-faint uppercase">CR</div>
                  </div>
                </div>
                {c.motifsTop && (
                  <div className="mt-2 text-[10px] text-faint truncate">
                    {c.motifsTop}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-faint mt-3">
            Permet de comparer le profil de l'arbitre entre saisons
            consecutives. Le profil est derive du ratio cartons/match
            quand il est principal.
          </p>
        </section>
      )}

      <section className="panel p-5">
        <div className="h-section mb-3">Historique des matchs ({liensMatchs.length})</div>
        {liensMatchs.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">
            Aucune participation enregistree{portee === "saison" ? " sur cette saison" : ""}.
          </p>
        ) : (
          <table className="table-fm">
            <thead>
              <tr>
                <th>J</th>
                <th>Match</th>
                <th>Score</th>
                <th>Role</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {liensMatchs.map((p: any) => {
                const m = p.matchData;
                if (!m) return null;
                const dom = clubs.find((c: any) => c.id === m.clubDom);
                const ext = clubs.find((c: any) => c.id === m.clubExt);
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-muted">{m.journee ?? "—"}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {dom && <ClubBadge clubId={dom.id} size={16}/>}
                        <span className="text-sm">{dom?.nom ?? m.clubDom}</span>
                        <span className="text-faint">vs</span>
                        {ext && <ClubBadge clubId={ext.id} size={16}/>}
                        <span className="text-sm">{ext?.nom ?? m.clubExt}</span>
                      </div>
                    </td>
                    <td>
                      <Link href={`/matchs/${m.id}`} className="font-mono font-semibold tabular-nums hover:text-turf">
                        {m.scoreDom}–{m.scoreExt}
                      </Link>
                    </td>
                    <td><span className="badge">{ROLE_LIBELLE[p.role] ?? p.role}</span></td>
                    <td>
                      {p.note != null ? (
                        <span className="font-display font-bold text-turf tabular-nums flex items-center gap-1">
                          <Star size={11}/> {p.note}
                        </span>
                      ) : <span className="text-faint text-xs">non notee</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="stat-tile flex flex-col items-center justify-center">
      <div className="stat-label">{label}</div>
      <div className={`font-display text-3xl font-black ${color} tabular-nums mt-1`}>{value}</div>
    </div>
  );
}
