// src/app/classement/page.tsx
//
// Le classement est strictement filtre sur la poule de l'equipe propre
// (selectionnee dans le switcher en bas de la sidebar). Si le cookie
// n'est pas encore pose au 1er chargement, on infere automatiquement
// l'equipe : la plus active de mon club dans la saison active.

import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnEquipeIdServer, getOwnSaisonIdServer } from "@/lib/own-equipe";
import { ClassementTabs } from "@/components/ClassementTabs";

export const metadata = { title: "Classement · Foot Analytics" };

export default async function Classement() {
  const CLUB_PROPRE_ID = getOwnClubIdServer();
  const OWN_EQUIPE_ID = getOwnEquipeIdServer();
  const OWN_SAISON_ID = getOwnSaisonIdServer();

  const [classementBrut, clubs, matchs, joueurs, equipes, saisons] = await Promise.all([
    api.classement(),
    api.clubs(),
    api.matchs(),
    api.joueurs(),
    api.equipes(),
    api.saisons(),
  ]);

  // Determine l'equipe propre en priorisant la coherence saison.
  // - Cookie ownEquipeId sur equipe de la saison ownSaisonId -> on l'utilise
  // - Cookie ownEquipeId sur equipe d'une autre saison (bascule recente)
  //   -> on cherche l'equivalent (meme categorie+poule+libelle) sur ownSaisonId
  // - Sinon fallback : 1ere equipe de mon club sur ownSaisonId
  let equipePropre: any = null;
  const eqCookie = OWN_EQUIPE_ID
    ? equipes.find((e: any) => e.id === OWN_EQUIPE_ID) ?? null
    : null;
  if (eqCookie && OWN_SAISON_ID && eqCookie.saisonId === OWN_SAISON_ID) {
    equipePropre = eqCookie;
  } else if (eqCookie && OWN_SAISON_ID) {
    equipePropre = equipes.find((e: any) =>
      e.saisonId === OWN_SAISON_ID
      && e.clubId === eqCookie.clubId
      && (
        (e.categorie ?? null) === (eqCookie.categorie ?? null)
        || ((e.competitionLibelle ?? null) === (eqCookie.competitionLibelle ?? null)
            && (e.poule ?? null) === (eqCookie.poule ?? null))
      )) ?? null;
  } else if (eqCookie) {
    equipePropre = eqCookie;
  }
  if (!equipePropre) {
    const saisonCible = OWN_SAISON_ID
      ?? saisons.find((s: any) => s.actif)?.id
      ?? saisons[0]?.id;
    const equipesMonClub = equipes.filter((e: any) =>
      e.clubId === CLUB_PROPRE_ID
      && (!saisonCible || e.saisonId === saisonCible),
    );
    const scoresActivite = new Map<string, number>();
    for (const m of matchs) {
      if (m.equipeDomId) scoresActivite.set(m.equipeDomId, (scoresActivite.get(m.equipeDomId) ?? 0) + 1);
      if (m.equipeExtId) scoresActivite.set(m.equipeExtId, (scoresActivite.get(m.equipeExtId) ?? 0) + 1);
    }
    equipesMonClub.sort((a: any, b: any) =>
      (scoresActivite.get(b.id) ?? 0) - (scoresActivite.get(a.id) ?? 0)
    );
    equipePropre = equipesMonClub[0] ?? null;
  }

  // Filtre strict : meme saison + meme competitionLibelle + meme poule
  // que l'equipe propre.
  let classement = classementBrut;
  // Matchs et joueurs filtres pour les sous-onglets (stats equipes / joueurs).
  // Sans ce filtre, les sous-onglets melangent toutes les saisons et
  // les joueurs des autres clubs.
  let matchsChampionnat = matchs;
  let joueursDuClub = joueurs;
  if (equipePropre) {
    const equipesDuChampionnat = new Set(
      equipes
        .filter((e: any) =>
          e.saisonId === equipePropre.saisonId
          && (e.competitionLibelle ?? null) === (equipePropre.competitionLibelle ?? null)
          && (e.poule ?? null) === (equipePropre.poule ?? null))
        .map((e: any) => e.id),
    );
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
    // Joueurs : ceux appartenant aux equipes du championnat. On garde
    // les joueurs dont l'equipeId principale est dans le championnat,
    // ou ceux attaches a une des equipes via equipesAttachees.
    joueursDuClub = joueurs.filter((j: any) => {
      if (j.equipeId && equipesDuChampionnat.has(j.equipeId)) return true;
      if (Array.isArray(j.equipesAttachees) && j.equipesAttachees.some((eid: string) => equipesDuChampionnat.has(eid))) return true;
      // Fallback : joueur du club propre, mais on ne peut pas savoir la
      // saison — on l'inclut pour ne pas casser l'existant.
      return false;
    });
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
            <code className="text-turf">POST /api/derivation/rebuild-all</code>
            ).
          </p>
        )}
      </header>

      <ClassementTabs
        classement={classement}
        clubs={clubs}
        matchs={matchsChampionnat}
        joueurs={joueursDuClub}
        ownClubId={CLUB_PROPRE_ID}
      />
    </div>
  );
}
