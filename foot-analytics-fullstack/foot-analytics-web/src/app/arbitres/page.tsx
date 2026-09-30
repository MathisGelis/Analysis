// src/app/arbitres/page.tsx
//
// Liste filtrable des arbitres ayant officie dans le championnat de
// mon equipe propre. Les stats affichees sont decomposees sur ce
// championnat (et non un cumul global toutes saisons). Pour comparer
// le profil d'un arbitre entre saisons, voir sa fiche detaillee.

import { api } from "@/lib/api";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { ArbitresFiltrable } from "@/components/ArbitresFiltrable";
import { restreindreAuChampionnat } from "@/lib/arbitres-liste";

export const metadata = { title: "Arbitres · Foot Analytics" };

export default async function ArbitresList() {
  const [arbitres, equipes, saisons, matchs] = await Promise.all([
    api.arbitres(),
    api.equipes(),
    api.saisons(),
    api.matchs(),
  ]);

  // Championnat propre : resolution centralisee (meme regles que /classement).
  const { equipe: equipePropre, championnat } =
    await resolveEquipePropre({ equipes, saisons, matchs });

  // Seuls les arbitres du championnat (et leur participation a celui-ci) traversent vers le client.
  const arbitresChamp = restreindreAuChampionnat(arbitres as any[], championnat);

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
        <ArbitresFiltrable arbitres={arbitresChamp as any} championnat={championnat} />
      )}

      <section className="panel-inset p-4 text-xs text-muted leading-relaxed">
        <strong className="text-ink">Profil arbitre :</strong> calcule a partir
        du nombre de cartons donnes par match (en tant que principal uniquement) :
        <span className="text-accent"> Permissif</span> &lt; 2/match,
        <span className="text-amber"> Standard</span> 2 a 5/match,
        <span className="text-danger"> Strict</span> &gt; 5/match.
        Les stats sont restreintes au championnat selectionne — l'historique
        sur les saisons precedentes est visible dans la fiche de chaque
        arbitre.
      </section>
    </div>
  );
}
