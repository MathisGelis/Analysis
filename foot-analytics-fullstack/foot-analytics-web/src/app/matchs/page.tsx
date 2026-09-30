// src/app/matchs/page.tsx
//
// Liste des matchs — restreinte au CHAMPIONNAT PROPRE (meme saison,
// meme competition, meme poule que l'equipe propre selectionnee).
// Utilise le composant MatchsTable qui filtre par saison et permet
// des filtres complementaires (Equipe, Journee).
//
// Sur une nouvelle saison sans matchs joues, le tableau est VIDE
// (comportement voulu) et le filtre "Equipe" ne montre que les
// equipes du championnat courant (Seniors D2 uniquement, pas U18 etc).

import Link from "next/link";
import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnEquipeIdServer, getOwnSaisonIdServer } from "@/lib/own-equipe";
import { MatchsTable } from "@/components/MatchsTable";
import { Upload } from "lucide-react";

export const metadata = { title: "Matchs · Foot Analytics" };

export default async function MatchsPage() {
  const CLUB_PROPRE_ID = getOwnClubIdServer();
  const OWN_EQUIPE_ID = getOwnEquipeIdServer();
  const OWN_SAISON_ID = getOwnSaisonIdServer();

  const [matchs, clubs, saisons, equipes] = await Promise.all([
    api.matchs(),
    api.clubs(),
    api.saisons(),
    api.equipes(),
  ]);

  // Determine l'equipe propre (memes regles que /classement, /arbitres).
  let equipePropre: any = null;
  if (OWN_EQUIPE_ID) {
    equipePropre = equipes.find((e: any) => e.id === OWN_EQUIPE_ID) ?? null;
  }
  if (!equipePropre) {
    const saisonActive = saisons.find((s: any) => s.actif) ?? saisons[0];
    const mesEquipes = equipes.filter((e: any) =>
      e.clubId === CLUB_PROPRE_ID
      && (!saisonActive || e.saisonId === saisonActive.id));
    const activite = new Map<string, number>();
    for (const m of matchs) {
      if (m.equipeDomId) activite.set(m.equipeDomId, (activite.get(m.equipeDomId) ?? 0) + 1);
      if (m.equipeExtId) activite.set(m.equipeExtId, (activite.get(m.equipeExtId) ?? 0) + 1);
    }
    mesEquipes.sort((a: any, b: any) =>
      (activite.get(b.id) ?? 0) - (activite.get(a.id) ?? 0));
    equipePropre = mesEquipes[0] ?? null;
  }

  // Filtre matchs et equipes par championnat propre.
  let matchsFiltres = matchs;
  let equipesFiltres = equipes;
  if (equipePropre) {
    const equipesDuChampionnat = new Set(
      equipes
        .filter((e: any) =>
          e.saisonId === equipePropre.saisonId
          && (e.competitionLibelle ?? null) === (equipePropre.competitionLibelle ?? null)
          && (e.poule ?? null) === (equipePropre.poule ?? null))
        .map((e: any) => e.id),
    );
    matchsFiltres = matchs.filter((m: any) =>
      (m.equipeDomId && equipesDuChampionnat.has(m.equipeDomId))
      || (m.equipeExtId && equipesDuChampionnat.has(m.equipeExtId)),
    );
    // Equipes du switcher : uniquement celles du championnat (=
    // adversaires possibles). Sur une nouvelle saison sans matchs
    // encore, la liste contient au moins ma propre equipe.
    equipesFiltres = equipes.filter((e: any) => equipesDuChampionnat.has(e.id));
  } else if (OWN_SAISON_ID) {
    // Pas d'equipe resolue mais une saison est choisie : filtre au
    // moins par saison pour eviter d'afficher toutes saisons.
    matchsFiltres = matchs.filter((m: any) => (m.saisonId ?? null) === OWN_SAISON_ID);
    equipesFiltres = equipes.filter((e: any) => (e.saisonId ?? null) === OWN_SAISON_ID);
  }

  const headerLibelle = equipePropre
    ? `${equipePropre.competitionLibelle ?? equipePropre.nom}${equipePropre.poule ? ` · Poule ${equipePropre.poule}` : ""}`
    : "Aucun championnat selectionne";

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-center justify-between">
        <div>
          <div className="h-section">{headerLibelle}</div>
          <h1 className="font-display text-2xl font-bold text-ink">Matchs de la saison</h1>
        </div>
        <Link href="/import" className="btn btn-turf">
          <Upload size={14}/> Importer une feuille FMI
        </Link>
      </header>

      {matchsFiltres.length === 0 ? (
        <section className="panel p-8 text-center">
          <div className="text-sm text-muted mb-2">
            Aucun match pour l'instant sur cette saison.
          </div>
          <p className="text-xs text-faint max-w-md mx-auto">
            Le tableau se remplit automatiquement au fur et a mesure
            des imports de feuilles FMI. C'est normal en debut de
            saison — importe une premiere FMI pour demarrer.
          </p>
        </section>
      ) : (
        <MatchsTable
          matchs={matchsFiltres}
          clubs={clubs}
          saisons={saisons}
          equipes={equipesFiltres}
        />
      )}
    </div>
  );
}
