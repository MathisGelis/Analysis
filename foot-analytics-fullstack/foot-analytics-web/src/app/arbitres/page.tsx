// src/app/arbitres/page.tsx
//
// Liste filtrable des arbitres ayant officie dans le championnat de
// mon equipe propre. Les stats affichees sont decomposees sur ce
// championnat (et non un cumul global toutes saisons). Pour comparer
// le profil d'un arbitre entre saisons, voir sa fiche detaillee.

import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnEquipeIdServer } from "@/lib/own-equipe";
import { ArbitresFiltrable } from "@/components/ArbitresFiltrable";

export const metadata = { title: "Arbitres · Foot Analytics" };

export default async function ArbitresList() {
  const CLUB_PROPRE_ID = getOwnClubIdServer();
  const OWN_EQUIPE_ID = getOwnEquipeIdServer();
  const [arbitres, equipes, saisons, matchs] = await Promise.all([
    api.arbitres(),
    api.equipes(),
    api.saisons(),
    api.matchs(),
  ]);

  // Determine le championnat propre. Memes regles que pour /classement :
  // 1. Cookie pose -> on prend cette equipe.
  // 2. Sinon -> equipe de mon club la plus active dans la saison active.
  let equipePropre: any = null;
  if (OWN_EQUIPE_ID) equipePropre = equipes.find((e: any) => e.id === OWN_EQUIPE_ID) ?? null;
  if (!equipePropre) {
    const saisonActive = saisons.find((s: any) => s.actif) ?? saisons[0];
    const mesEquipes = equipes.filter((e: any) =>
      e.clubId === CLUB_PROPRE_ID && (!saisonActive || e.saisonId === saisonActive.id));
    const activite = new Map<string, number>();
    for (const m of matchs) {
      if (m.equipeDomId) activite.set(m.equipeDomId, (activite.get(m.equipeDomId) ?? 0) + 1);
      if (m.equipeExtId) activite.set(m.equipeExtId, (activite.get(m.equipeExtId) ?? 0) + 1);
    }
    mesEquipes.sort((a: any, b: any) =>
      (activite.get(b.id) ?? 0) - (activite.get(a.id) ?? 0));
    equipePropre = mesEquipes[0] ?? null;
  }

  const championnat = equipePropre
    ? {
        saisonId: equipePropre.saisonId ?? null,
        competitionLibelle: equipePropre.competitionLibelle ?? null,
        poule: equipePropre.poule ?? null,
      }
    : null;

  const headerLibelle = equipePropre
    ? `${equipePropre.competitionLibelle ?? equipePropre.nom}${equipePropre.poule ? ` · Poule ${equipePropre.poule}` : ""}`
    : "Aucune equipe selectionnee";

  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section">{headerLibelle}</div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Arbitres
        </h1>
      </header>

      {arbitres.length === 0 ? (
        <section className="panel p-8 text-sm text-muted text-center">
          Aucun arbitre en base. Les arbitres sont automatiquement ajoutes
          a chaque import de feuille FMI.
        </section>
      ) : (
        <ArbitresFiltrable arbitres={arbitres as any} championnat={championnat} />
      )}

      <section className="panel-inset p-4 text-xs text-muted leading-relaxed">
        <strong className="text-ink">Profil arbitre :</strong> calcule a partir
        du nombre de cartons donnes par match (en tant que principal uniquement) :
        <span className="text-turf"> Permissif</span> &lt; 2/match,
        <span className="text-amber"> Standard</span> 2 a 5/match,
        <span className="text-danger"> Strict</span> &gt; 5/match.
        Les stats sont restreintes au championnat selectionne — l'historique
        sur les saisons precedentes est visible dans la fiche de chaque
        arbitre.
      </section>
    </div>
  );
}
