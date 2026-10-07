import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * IA : le reentrainement automatique du mercredi. Les entrainements gardent ce qui les a declenches (declencheur), la
 * decision prise face au modele actif (decision) et une preuve de vie (maj) ; le planning (actif ou non, depuis quand)
 * est range dans ia_reglages, verrouillee comme les autres tables (RLS sans politique : voir VerrouillerApiDonnees).
 */
export class PlanningIa1791300000000 implements MigrationInterface {
  name = "PlanningIa1791300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ia_entrainements" ADD "declencheur" character varying NOT NULL DEFAULT 'manuel'`);
    await queryRunner.query(`ALTER TABLE "ia_entrainements" ADD "decision" text`);
    await queryRunner.query(`ALTER TABLE "ia_entrainements" ADD "maj" character varying`);
    await queryRunner.query(`CREATE TABLE "ia_reglages" ("cle" character varying NOT NULL, "valeur" text NOT NULL, CONSTRAINT "PK_ia_reglages_cle" PRIMARY KEY ("cle"))`);
    await queryRunner.query(`ALTER TABLE "ia_reglages" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ia_reglages"`);
    await queryRunner.query(`ALTER TABLE "ia_entrainements" DROP COLUMN "maj"`);
    await queryRunner.query(`ALTER TABLE "ia_entrainements" DROP COLUMN "decision"`);
    await queryRunner.query(`ALTER TABLE "ia_entrainements" DROP COLUMN "declencheur"`);
  }
}
