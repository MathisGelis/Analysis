// src/app/classement/page.tsx
//
// Le classement est strictement filtre sur la poule de l'equipe propre
// (selectionnee dans le switcher en bas de la sidebar). Si le cookie
// n'est pas encore pose au 1er chargement, resolveEquipePropre infere
// l'equipe : la plus active de mon club dans la saison active.

import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { ClassementTabs } from "@/components/ClassementTabs";

export const metadata = { title: "Classement · Foot Analytics" };

export default async function Classement() {
  const CLUB_PROPRE_ID = getOwnClubIdServer();

  const [classementBrut, clubs, matchs, equipes, saisons] = await Promise.all([
    api.classement(),
    api.clubs(),
    api.matchs(),
    api.equipes(),
    api.saisons(),
  ]);

  // Equipe propre + championnat : resolution centralisee (cookie, equivalent
  // sur la saison choisie, sinon equipe la plus active de mon club).
  const { equipe: equipePropre, equipesDuChampionnat } =
    await resolveEquipePropre({ equipes, saisons, matchs });

  // Filtre strict : meme saison + meme competitionLibelle + meme poule
  // que l'equipe propre.
  let classement = classementBrut;
  // Matchs et joueurs filtres pour les sous-onglets (stats equipes / joueurs).
  // Sans ce filtre, les sous-onglets melangent toutes les saisons et
  // les joueurs des autres clubs.
  let matchsChampionnat = matchs;
  // Stats joueurs : calculees par le backend sur les seuls matchs de CE
  // championnat. Les compteurs de api.joueurs() sont des cumuls de
  // carriere, ils fausseraient l'onglet.
  let joueursDuChampionnat: any[] = [];
  if (equipePropre) {
    joueursDuChampionnat = await api.joueursChampionnat(equipePropre.id);
    const clubsDuChampionnat = new Set(
      classementBrut
        .filter((l: any) => l.equipeId && equipesDuChampionnat.has(l.equipeId))
        .map((l: any) => l.clubId),
    );
    classement = classementBrut.filter((l: any) =>
      l.equipeId && equipesDuChampionnat.has(l.equipeId),
    );
    matchsChampionnat = matchs.filter((m: any) =>
      (m.equipeDomId && equipesDuChampionnat.has(m.equipeDomId))
      || (m.equipeExtId && equipesDuChampionnat.has(m.equipeExtId))
      || (m.saisonId === equipePropre.saisonId
          && clubsDuChampionnat.has(m.clubDom)
          && clubsDuChampionnat.has(m.clubExt)),
    );
  }

  // Recompose la valeur a afficher dans le header.
  const headerLibelle = equipePropre
    ? `${equipePropre.competitionLibelle ?? equipePropre.nom}${equipePropre.poule ? ` · Poule ${equipePropre.poule}` : ""}`
    : "Aucune equipe selectionnee";

  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section">{headerLibelle}</div>
        <h1 className="font-display text-2xl font-bold text-ink">Classement</h1>
        {equipePropre && classement.length === 0 && (
          <p className="text-xs text-faint mt-2">
            Aucune ligne de classement pour cette competition.
            Verifie que les matchs ont bien ete importes et lance un
            rebuild si necessaire ({" "}
            <code className="text-accent">POST /api/derivation/rebuild-all</code>
            ).
          </p>
        )}
      </header>

      <ClassementTabs
        classement={classement}
        clubs={clubs}
        matchs={matchsChampionnat}
        joueurs={joueursDuChampionnat}
        ownClubId={CLUB_PROPRE_ID}
      />
    </div>
  );
}
