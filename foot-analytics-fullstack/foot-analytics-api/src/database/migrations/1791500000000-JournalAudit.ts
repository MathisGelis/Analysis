import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Journal d'audit (voir features/audit) : table en ajout seul, verrouillee comme les autres (RLS sans politique), et
 * fonction de purge des traces anciennes. La fonction est SECURITY DEFINER : un role applicatif restreint, prive du
 * droit DELETE sur la table (sql/role-application.sql), peut purger ce qui a depasse la duree de conservation, et rien
 * d'autre. Son search_path est fige sur le schema de la table.
 */
export class JournalAudit1791500000000 implements MigrationInterface {
  name = "JournalAudit1791500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "journal_audit" ("id" character varying NOT NULL, "le" character varying NOT NULL, "action" character varying NOT NULL, "utilisateurId" character varying, "role" character varying, "clubId" character varying, "cible" character varying, "cibleClubId" character varying, "details" text, "ip" character varying, CONSTRAINT "PK_26b79fb8b86a08630dacfdb4c0c" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_6b4891a6c20fbd2aa5eece56e5" ON "journal_audit" ("le") `);
    await queryRunner.query(`CREATE INDEX "IDX_ccb57982c5dc245f9b907e50ea" ON "journal_audit" ("action") `);
    await queryRunner.query(`CREATE INDEX "IDX_ef1b91a9d8e75f2bf98e0dc6f5" ON "journal_audit" ("utilisateurId") `);
    await queryRunner.query(`ALTER TABLE "journal_audit" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DO $$
      BEGIN
        EXECUTE format($f$
          CREATE OR REPLACE FUNCTION %1$I.purger_journal_audit(avant character varying) RETURNS integer
          LANGUAGE plpgsql SECURITY DEFINER SET search_path = %1$I AS $corps$
          DECLARE n integer;
          BEGIN
            DELETE FROM journal_audit WHERE le < avant;
            GET DIAGNOSTICS n = ROW_COUNT;
            RETURN n;
          END $corps$
        $f$, current_schema());
        EXECUTE format('REVOKE ALL ON FUNCTION %I.purger_journal_audit(character varying) FROM PUBLIC', current_schema());
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS purger_journal_audit(character varying)`);
    await queryRunner.query(`DROP INDEX "IDX_ef1b91a9d8e75f2bf98e0dc6f5"`);
    await queryRunner.query(`DROP INDEX "IDX_ccb57982c5dc245f9b907e50ea"`);
    await queryRunner.query(`DROP INDEX "IDX_6b4891a6c20fbd2aa5eece56e5"`);
    await queryRunner.query(`DROP TABLE "journal_audit"`);
  }
}
