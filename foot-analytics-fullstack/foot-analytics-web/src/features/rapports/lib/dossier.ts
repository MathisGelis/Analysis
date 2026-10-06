// src/features/rapports/lib/dossier.ts
//
// LE DOSSIER D'UN CLUB : tout ce que l'on prepare ou lit sur un club tient en trois documents, ouverts depuis le meme
// endroit (la page Rapports) et relies entre eux par les memes onglets :
//   - pre-match : le prochain match contre ce club (projection, systeme et onze probables, pistes) ; ferme sur une saison
//                 passee (il n'y a pas de match a preparer) et absent pour mon propre club ;
//   - analyse   : le rapport d'equipe (tendances, joueurs cles, discipline) ;
//   - scouting  : les notes d'observation sur ce club.
// Fonctions pures.

export type DocumentDossier = "prematch" | "equipe" | "scouting";

export interface OngletDossier {
  id: DocumentDossier;
  label: string;
  href: string;
}

export interface OptionsDossier {
  /** Mon propre club : pas de pre-match (on ne prepare pas un match contre soi), ni de scouting. */
  monClub?: boolean;
  /** Le pre-match est ouvert (saison en cours ou a venir). */
  prematchOuvert: boolean;
  /** Le match a preparer (le prochain contre ce club), pour pre-remplir le rapport pre-match. */
  matchId?: string | null;
}

/** Les documents disponibles pour ce club, dans l'ordre de lecture habituel. */
export function ongletsDuDossier(clubId: string, o: OptionsDossier): OngletDossier[] {
  const onglets: OngletDossier[] = [];
  if (!o.monClub && o.prematchOuvert) {
    onglets.push({ id: "prematch", label: "Pre-match", href: `/rapports/prematch/${clubId}${o.matchId ? `?matchId=${encodeURIComponent(o.matchId)}` : ""}` });
  }
  onglets.push({ id: "equipe", label: "Analyse d'equipe", href: `/rapports/equipe/${clubId}` });
  if (!o.monClub) onglets.push({ id: "scouting", label: "Scouting", href: `/club/${clubId}/scouting` });
  return onglets;
}
