// src/lib/arbitres-liste.ts
//
// Liste des arbitres d'un championnat. Le serveur envoie pour chaque arbitre le JSON de toutes ses
// participations (saison + competition + poule) : sur un championnat de 300 arbitres, c'est l'essentiel
// du poids de la page alors que la vue n'en lit qu'une. `restreindreAuChampionnat` ne garde, cote
// serveur, que les arbitres du championnat et leur seule participation utile.

export interface FiltreChampionnat {
  saisonId: string | null;
  competitionLibelle: string | null;
  poule: string | null;
}

interface ParticipationCle {
  saisonId: string | null;
  competitionLibelle: string | null;
  poule: string | null;
}

/** JSON serialise -> liste ; illisible ou absent : liste vide. */
export function lireParticipations<P extends ParticipationCle>(json: string | null | undefined): P[] {
  try { return json ? (JSON.parse(json) as P[]) : []; } catch { return []; }
}

/** La participation d'un arbitre a CE championnat (meme saison, competition et poule), sinon undefined. */
export function participationDuChampionnat<P extends ParticipationCle>(parts: P[], championnat: FiltreChampionnat): P | undefined {
  return parts.find((p) =>
    p.saisonId === championnat.saisonId
    && (p.competitionLibelle ?? null) === (championnat.competitionLibelle ?? null)
    && (p.poule ?? null) === (championnat.poule ?? null));
}

/**
 * Sans championnat : tous les arbitres, sur leurs stats globales (les participations ne servent pas).
 * Avec championnat : seuls les arbitres qui y ont officie, avec cette seule participation.
 */
export function restreindreAuChampionnat<A extends { participations?: string | null }>(
  arbitres: A[], championnat: FiltreChampionnat | null,
): A[] {
  if (!championnat) return arbitres.map((a) => ({ ...a, participations: null }));
  return arbitres.flatMap((a) => {
    const p = participationDuChampionnat(lireParticipations<ParticipationCle>(a.participations), championnat);
    return p ? [{ ...a, participations: JSON.stringify([p]) }] : [];
  });
}

/** Stats d'un arbitre sur le perimetre affiche, utiles au tri. */
export interface StatsTriArbitre { matchsOfficies: number; matchsPrincipal: number }

export type GroupeArbitre = "principal" | "autres";

/** "principal" des qu'il a arbitre au moins un match au centre ; "autres" : assistant ou autre role seulement. */
export const groupeArbitre = (s: StatsTriArbitre): GroupeArbitre => (s.matchsPrincipal > 0 ? "principal" : "autres");

/**
 * Les arbitres principaux d'abord, du plus au moins de matchs au centre (puis de matchs officies) ; ensuite
 * ceux qui n'ont officie qu'en assistant ou autre role, du plus au moins de matchs ; A-Z a egalite.
 */
export function trierArbitres<A extends { nom: string; prenom?: string | null; _stats: StatsTriArbitre }>(arbitres: A[]): A[] {
  const nomComplet = (a: A) => `${a.nom} ${a.prenom ?? ""}`.trim();
  return [...arbitres].sort((a, b) => {
    const ga = groupeArbitre(a._stats), gb = groupeArbitre(b._stats);
    if (ga !== gb) return ga === "principal" ? -1 : 1;
    return (ga === "principal" ? b._stats.matchsPrincipal - a._stats.matchsPrincipal : 0)
      || b._stats.matchsOfficies - a._stats.matchsOfficies
      || nomComplet(a).localeCompare(nomComplet(b), "fr", { sensitivity: "base" });
  });
}
