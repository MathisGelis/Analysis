// src/features/matchs/details-matchs.ts
//
// Charge les compositions et les evenements de matchs DEJA lus, par deux requetes a plat plutot que
// par `find({ relations: ["compositions", "evenements"] })`. Ce dernier fait un seul JOIN qui renvoie
// compositions x evenements lignes PAR MATCH (36 x 15 = 540 lignes pour un match de district) :
// sur un championnat la derivation en hydratait des dizaines de milliers et y passait l'essentiel de
// son temps. Ici, le volume est simplement la somme des deux tables.

import { EntityManager, In } from "typeorm";

import { Composition } from "./composition.entity";
import { EvenementMatch } from "./evenement-match.entity";
import { Match } from "./match.entity";

/** Taille des lots d'identifiants (SQLite limite le nombre de variables d'une requete). */
const TAILLE_LOT = 500;

/** Renseigne `compositions` et `evenements` de chaque match (tableaux vides si aucun) et renvoie la meme liste. */
export async function chargerDetailsMatchs(
  matchs: Match[], manager: EntityManager, tailleLot = TAILLE_LOT,
): Promise<Match[]> {
  const compositions = new Map<string, Composition[]>();
  const evenements = new Map<string, EvenementMatch[]>();
  for (let i = 0; i < matchs.length; i += tailleLot) {
    const ids = matchs.slice(i, i + tailleLot).map((m) => m.id);
    const [cs, es] = await Promise.all([
      manager.getRepository(Composition).find({ where: { matchId: In(ids) } }),
      manager.getRepository(EvenementMatch).find({ where: { matchId: In(ids) } }),
    ]);
    for (const c of cs) (compositions.get(c.matchId) ?? compositions.set(c.matchId, []).get(c.matchId)!).push(c);
    for (const e of es) (evenements.get(e.matchId) ?? evenements.set(e.matchId, []).get(e.matchId)!).push(e);
  }
  for (const m of matchs) {
    m.compositions = compositions.get(m.id) ?? [];
    m.evenements = evenements.get(m.id) ?? [];
  }
  return matchs;
}
