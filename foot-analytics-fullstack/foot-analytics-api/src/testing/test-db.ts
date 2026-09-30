// src/testing/test-db.ts
//
// Base SQLite EN MEMOIRE (sql.js) + fabriques minimalistes pour les tests
// de services. Aucun mock : les services tournent sur de vrais repositories
// TypeORM, avec le meme schema que l'application (synchronize).

import { DataSource, DeepPartial, EntityTarget } from "typeorm";
import {
  ALL_ENTITIES, Club, Composition, Equipe, EvenementMatch, Joueur, Match, Saison,
} from "@/entities";

export async function creerBaseTest(): Promise<DataSource> {
  const ds = new DataSource({
    type: "sqljs",
    entities: ALL_ENTITIES,
    synchronize: true,
    dropSchema: true,
  });
  await ds.initialize();
  return ds;
}

/** Fabriques : chaque appel persiste l'entite et la retourne. */
export function fabriques(ds: DataSource) {
  async function sauver<T extends object>(
    cible: EntityTarget<T>, data: DeepPartial<T>,
  ): Promise<T> {
    const repo = ds.getRepository(cible);
    const sauvee = await repo.save(repo.create(data as any));
    return sauvee as unknown as T;
  }
  return {
    club: (nom: string, extra: DeepPartial<Club> = {}) => sauver<Club>(Club, { nom, ...extra }),
    saison: (nom: string, anneeDebut: number, extra: DeepPartial<Saison> = {}) =>
      sauver<Saison>(Saison, { nom, anneeDebut, ...extra }),
    equipe: (extra: DeepPartial<Equipe> & { clubId: string; nom: string }) =>
      sauver<Equipe>(Equipe, extra),
    joueur: (extra: DeepPartial<Joueur> & { nom: string }) => sauver<Joueur>(Joueur, extra),
    match: (extra: DeepPartial<Match> & { clubDom: string; clubExt: string }) =>
      sauver<Match>(Match, extra),
    compo: (extra: DeepPartial<Composition> & { matchId: string; cote: "dom" | "ext"; nom: string }) =>
      sauver<Composition>(Composition, { numero: 1, titulaire: true, minutes: 90, ...extra }),
    evenement: (extra: DeepPartial<EvenementMatch> & {
      matchId: string; type: string; joueur: string; equipe: "dom" | "ext";
    }) => sauver<EvenementMatch>(EvenementMatch, extra),
  };
}
