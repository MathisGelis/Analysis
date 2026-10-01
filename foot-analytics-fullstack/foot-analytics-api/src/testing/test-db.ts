// src/testing/test-db.ts
//
// Base de test + fabriques minimalistes pour les tests de services. Aucun mock : les services tournent sur
// de vrais repositories TypeORM, avec le meme schema que l'application (synchronize).
//
// Par defaut : SQLite EN MEMOIRE (sql.js). Avec TEST_DATABASE_URL (une URL Postgres), la meme suite tourne sur
// Postgres : chaque test recoit son propre schema, supprime a la fin, donc les tests restent isoles et les
// fichiers de test peuvent s'executer en parallele sur la meme base.
//
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/foot_test npx jest

import { randomBytes } from "node:crypto";
import { DataSource, DeepPartial, EntityTarget } from "typeorm";
import {
  OPTIONS_ENTITES, Club, Composition, Equipe, EvenementMatch, Joueur, Match, Saison,
} from "@/entities";

export const TESTS_SUR_POSTGRES = !!process.env.TEST_DATABASE_URL;

/** Les tests creent et suppriment des schemas, et au besoin des roles : jamais sur une base hebergee. */
export function refuserBaseHebergee(url: string): void {
  const hote = new URL(url).hostname.toLowerCase();
  if (/(^|\.)supabase\.(co|com)$/.test(hote) || hote.endsWith(".pooler.supabase.com")) {
    throw new Error(`TEST_DATABASE_URL pointe vers une base Supabase (${hote}) : utilise un Postgres local ou jetable.`);
  }
}

async function creerBasePostgres(url: string): Promise<DataSource> {
  refuserBaseHebergee(url);
  const schema = `t_${randomBytes(6).toString("hex")}`;
  const admin = new DataSource({ type: "postgres", url, extra: { max: 1 } });
  await admin.initialize();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.destroy();

  const ds = new DataSource({
    type: "postgres", url, schema, ...OPTIONS_ENTITES, synchronize: true, extra: { max: 3 },
  });
  await ds.initialize();
  const detruire = ds.destroy.bind(ds);
  ds.destroy = async () => {
    await ds.query(`DROP SCHEMA "${schema}" CASCADE`);
    await detruire();
  };
  return ds;
}

export async function creerBaseTest(): Promise<DataSource> {
  if (process.env.TEST_DATABASE_URL) return creerBasePostgres(process.env.TEST_DATABASE_URL);
  const ds = new DataSource({
    type: "sqljs",
    ...OPTIONS_ENTITES,
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
