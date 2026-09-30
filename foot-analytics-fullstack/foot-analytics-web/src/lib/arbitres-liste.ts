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
