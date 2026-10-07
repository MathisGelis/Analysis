// src/features/rapports/components/RapportsPage.tsx
//
// RAPPORTS : l'unique point d'entree pour preparer un match, analyser une equipe et suivre un adversaire. Chaque club de la
// saison a un dossier de trois documents (pre-match avec ses predictions, analyse d'equipe, scouting), ouverts depuis sa
// ligne ; le prochain match se prepare en un clic. Le scouting et les predictions n'ont plus de page a part.
//
// Tout est lu sur la saison choisie : clubs qui ont une equipe cette saison (ceux de ma poule en premier), rapports de
// scouting dates dans la saison. Sur une saison passee, le pre-match n'est plus propose (il n'y a pas de match a preparer).

import Link from "next/link";
import { CalendarClock, FileText, Info, Target, TrendingUp } from "lucide-react";

import { api } from "@/shared/lib/api";
import { getOwnClubIdServer } from "@/features/equipes/lib/own-club";
import { getOwnSaisonIdServer } from "@/features/equipes/lib/own-equipe";
import { resolveEquipePropre } from "@/features/equipes/lib/resolve-equipe-propre";
import { clubsDeLaSaison, clubsDuChampionnat } from "@/features/clubs/lib/clubs-saison";
import { prochainMatch, resultatsDeLEquipe } from "@/features/matchs/lib/matchs-equipe";
import { ClubBadge } from "@/features/clubs/components/ClubBadge";
import { DynamiquePoule } from "@/features/analyse/components/DynamiquePoule";
import { MiniDynamique } from "@/features/analyse/components/MiniDynamique";
import { verdictPage } from "@/features/shell/lib/garde-page";

import { ongletsDuDossier, type OngletDossier } from "../lib/dossier";

export default async function Rapports() {
  const ownClubId = await getOwnClubIdServer();
  const idSaisonChoisie = await getOwnSaisonIdServer();
  const [clubs, saisons, equipes, matchs, prematch] = await Promise.all([
    api.clubs(), api.saisons(), api.equipes(), api.matchs(), verdictPage("/rapports/prematch"),
  ]);
  const prematchOuvert = prematch.restriction === null;
  const saison = saisons.find((s: any) => s.id === idSaisonChoisie) ?? saisons.find((s: any) => s.actif) ?? null;
  const [rapports, { equipe: maEquipe }] = await Promise.all([
    api.rapports(undefined, saison?.id),
    resolveEquipePropre({ equipes, saisons, matchs }),
  ]);
  const poule = maEquipe ? await api.dynamiquePoule(maEquipe.id) : null;
  const dynamiqueDe = new Map((poule?.equipes ?? []).map((e) => [e.clubId, e]));
  const scoutingDe = new Map(rapports.map((r) => [r.clubId, r]));

  // Le prochain match de mon equipe : son adversaire passe en tete, son pre-match s'ouvre en un clic.
  const prochain = prematchOuvert && maEquipe ? (prochainMatch(resultatsDeLEquipe(matchs, maEquipe.id).aVenir).prochain ?? undefined) : undefined;
  const prochainAdvId = prochain ? (prochain.equipeDomId === maEquipe?.id ? prochain.clubExt : prochain.clubDom) : null;
  const monClub = clubs.find((c) => c.id === ownClubId);

  const dansMaPoule = clubsDuChampionnat(equipes, maEquipe);
  const adversaires = clubsDeLaSaison(clubs, equipes, saison?.id ?? null, ownClubId)
    .sort((a, b) => Number(b.id === prochainAdvId) - Number(a.id === prochainAdvId)
      || Number(dansMaPoule.has(b.id)) - Number(dansMaPoule.has(a.id)) || a.nom.localeCompare(b.nom));
  const maPoule = adversaires.filter((c) => dansMaPoule.has(c.id));
  const affiches = maPoule.length > 0 ? maPoule : adversaires;

  const ligne = (c: { id: string; nom: string }) => {
    const r = scoutingDe.get(c.id);
    return (
      <LigneClub key={c.id} club={c} prochain={c.id === prochainAdvId}
        onglets={ongletsDuDossier(c.id, { prematchOuvert, matchId: c.id === prochainAdvId ? prochain?.id ?? null : null })}
        dynamique={dynamiqueDe.get(c.id)} scouting={r ? { date: r.date ?? null, dispositif: r.dispositifAttendu ?? null } : null} />
    );
  };

  return (
    <div className="space-y-6 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="h-section">Preparer, analyser, observer</div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Rapports{saison && <span className="font-light text-muted"> · {saison.nom}</span>}
          </h1>
        </div>
        <Link href="/import" className="btn text-sm">Importer une FMI</Link>
      </header>

      {/* Saison passee : on le dit, au lieu de faire disparaitre le pre-match sans explication. */}
      {!prematchOuvert && (
        <p className="panel-inset flex items-center gap-2 border-l-2 border-amber p-3 text-xs text-muted" data-testid="rapports-saison-passee">
          <Info size={14} className="shrink-0 text-amber" aria-hidden />
          La saison {saison?.nom ?? "choisie"} est terminee : le pre-match (avec ses predictions) se prepare sur la saison en cours.
          L'analyse d'equipe et le scouting restent consultables.
        </p>
      )}

      {/* Prochain match : le pre-match, en un clic */}
      {prematchOuvert && (
        <section className="panel relative overflow-hidden p-5" data-testid="prochain-match">
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-accentstrong/[0.12] via-transparent to-accent2/[0.06]" />
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><Target size={20} aria-hidden /></div>
            <div className="min-w-0 flex-1">
              <div className="h-section flex items-center gap-1.5"><CalendarClock size={11} aria-hidden /> Prochain match</div>
              {prochain && prochainAdvId ? (
                <div className="mt-1 flex items-center gap-2.5">
                  <ClubBadge clubId={prochainAdvId} size={28} />
                  <div className="min-w-0">
                    <div className="truncate font-display text-lg font-bold text-ink">{clubs.find((c) => c.id === prochainAdvId)?.nom ?? "Adversaire"}</div>
                    <div className="text-xs text-muted">
                      {prochain.journee ? `Journee ${String(prochain.journee).replace(/\D/g, "") || prochain.journee}` : "Prochain match"}
                      {prochain.date ? ` · ${prochain.date}` : ""}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted">Aucun match programme : ouvrez le pre-match d'un adversaire dans la liste ci-dessous pour preparer la rencontre.</p>
              )}
            </div>
            {prochain && prochainAdvId && (
              <Link href={`/rapports/prematch/${prochainAdvId}?matchId=${prochain.id}`} className="btn btn-primary text-sm">Rapport pre-match</Link>
            )}
          </div>
        </section>
      )}

      {/* Les dossiers : un par club */}
      <section className="panel p-5" aria-label="Dossiers des clubs" data-testid="dossiers-clubs">
        <p className="mb-4 max-w-3xl text-xs text-muted">
          Un dossier par club : <strong className="text-ink">Pre-match</strong> (projection du resultat, systeme et onze probables, pistes),
          <strong className="text-ink"> Analyse d'equipe</strong> (tendances, joueurs cles, discipline) et <strong className="text-ink">Scouting</strong> (vos notes d'observation).
        </p>
        {monClub && (
          <ul className="mb-5">
            <LigneClub club={monClub} moi onglets={ongletsDuDossier(monClub.id, { monClub: true, prematchOuvert })} dynamique={dynamiqueDe.get(monClub.id)} scouting={null} />
          </ul>
        )}
        {/* Seulement les clubs de ma poule ; poule inconnue : tous les clubs de la saison. */}
        <Groupe titre={maPoule.length > 0 ? "Ma poule" : "Clubs de la saison"} n={affiches.length}>{affiches.map(ligne)}</Groupe>
        {affiches.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">Aucun club adverse sur cette saison pour l'instant : importez des feuilles de match.</p>
        )}
      </section>

      {/* Dynamique de la poule */}
      {poule && poule.equipes.length > 0 && (
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="h-section flex items-center gap-2"><TrendingUp size={11} className="text-accent" />Dynamique de la poule</h2>
            <span className="text-[11px] text-faint">
              {[poule.competition, poule.poule ? `poule ${poule.poule}` : null, saison ? saison.nom : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          <DynamiquePoule poule={poule} equipeId={maEquipe?.id ?? null} />
        </section>
      )}
    </div>
  );
}

function Groupe({ titre, n, children }: { titre: string; n: number; children: React.ReactNode }) {
  if (n === 0) return null;
  return (
    <div className="mb-5 last:mb-0">
      <h2 className="h-section mb-2">{titre} ({n})</h2>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function LigneClub({
  club, moi = false, prochain = false, onglets, dynamique, scouting,
}: {
  club: { id: string; nom: string }; moi?: boolean; prochain?: boolean; onglets: OngletDossier[];
  dynamique?: Parameters<typeof MiniDynamique>[0]["equipe"]; scouting: { date: string | null; dispositif: string | null } | null;
}) {
  return (
    <li className={`panel-inset flex flex-wrap items-center gap-x-4 gap-y-2 p-3 ${moi ? "border-l-2 border-accent" : ""}`} data-testid={`dossier-${club.id}`}>
      <ClubBadge clubId={club.id} size={34} />
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-display text-sm font-bold text-ink">{club.nom}</span>
          {moi && <span className="badge badge-accent text-[10px]!">Mon equipe</span>}
          {prochain && <span className="badge badge-accent text-[10px]!">Prochain match</span>}
          {scouting && <span className="badge badge-amber text-[10px]!" title={scouting.date ? `Rapport de scouting du ${scouting.date}` : "Rapport de scouting"}><FileText size={9} aria-hidden /> Scouting</span>}
        </div>
        {scouting?.dispositif && <div className="mt-0.5 text-[11px] text-muted">Dispositif attendu : <span className="font-semibold text-accent">{scouting.dispositif}</span></div>}
        {dynamique && <MiniDynamique equipe={dynamique} />}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Documents de ${club.nom}`}>
        {onglets.map((o) => (
          <Link key={o.id} href={o.href} className={`btn text-xs ${o.id === "prematch" && prochain ? "btn-primary" : ""}`}
            aria-label={`${o.label} : ${club.nom}`}>{o.label}</Link>
        ))}
      </div>
    </li>
  );
}
