import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Supabase expose par defaut toutes les tables du schema aux roles `anon` et `authenticated` (API REST
 * automatique, cle `anon` publique). Cette API n'est pas utilisee : toute la donnee passe par l'API Nest, avec
 * le role proprietaire. On active donc la RLS sans aucune politique (acces refuse a ces roles) et on retire
 * leurs privileges, pour les tables existantes comme pour les futures.
 *
 * Sur un Postgres ordinaire (roles absents), seule la RLS est activee : sans effet pour le proprietaire.
 * Toute migration qui cree une table doit en faire autant ; migrations.pg.spec.ts le verifie.
 */
export class VerrouillerApiDonnees1790837600000 implements MigrationInterface {
  name = "VerrouillerApiDonnees1790837600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        t record;
        r text;
      BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
        END LOOP;
        FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', current_schema(), r);
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', current_schema(), r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM %I', current_schema(), r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I', current_schema(), r);
          END IF;
        END LOOP;
      END $$;
    `);
  }

  // Ne rend pas les privileges retires : rouvrir l'API publique ne doit jamais etre un effet de bord d'un retour arriere.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE t record;
      BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
          EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t.tablename);
        END LOOP;
      END $$;
    `);
  }
}
